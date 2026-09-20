import { Contract, JsonRpcProvider, Wallet, keccak256 } from 'ethers';
import { hashHex, hashId, proofRoot } from './merkle.mjs';

export const ANCHOR_ABI = [
  'function anchorCheckpoint(bytes32 id,bytes32 root,uint32 count)',
  'function checkpoints(bytes32 id) view returns (bytes32 root,uint32 count,uint64 blockNumber,uint64 timestamp)',
  'function verifyInclusion(bytes32 checkpointId,bytes32 leaf,bytes32[] siblings) view returns (bool)',
  'event CheckpointAnchored(bytes32 indexed id,bytes32 indexed root,uint32 count)',
];

export class Relayer {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });
    this.signer = new Wallet(config.privateKey, this.provider);
    this.anchor = new Contract(config.contractAddress, ANCHOR_ABI, this.signer);
    this.running = false;
    this.lastError = null;
    this.lastSuccess = null;
  }

  async validateChain() {
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== this.config.chainId) throw new Error('RPC chain ID differs from configured chain');
    if (await this.provider.getCode(this.config.contractAddress) === '0x') throw new Error('EvidenceAnchor is not deployed');
  }

  async poll() {
    if (this.running) return;
    this.running = true;
    try {
      await this.validateChain();
      const payload = await this.backend('/api/v1/trust/pending');
      if (!Array.isArray(payload.checkpoints) || payload.checkpoints.length > 1000) throw new Error('Invalid backend checkpoint queue');
      for (const item of payload.checkpoints) {
        hashId(item.id);
        if (!Number.isSafeInteger(item.event_count) || item.event_count < 1 || item.event_count > 1_000_000) throw new Error('Invalid checkpoint count');
        this.store.enqueue({ id: item.id, root: hashHex(item.root), event_count: item.event_count });
      }
      for (const item of this.store.pending()) {
        try { await this.deliver(item); }
        catch (error) {
          this.store.failed(item.id, error.message);
          throw error;
        }
      }
      this.lastError = null;
      this.lastSuccess = new Date().toISOString();
    } catch (error) { this.lastError = error.message; }
    finally { this.running = false; }
  }

  async deliver(item) {
    const id = hashId(item.id);
    let checkpoint = await this.anchor.checkpoints(id);
    if (checkpoint.root === `0x${'0'.repeat(64)}`) {
      if (!item.raw_transaction) {
        const request = await this.anchor.anchorCheckpoint.populateTransaction(id, item.root, item.event_count);
        const transaction = await this.signer.populateTransaction(request);
        const signed = await this.signer.signTransaction(transaction);
        this.store.signed(item.id, signed, keccak256(signed));
        item = this.store.get(item.id);
      }
      let receipt = await this.provider.getTransactionReceipt(item.transaction_hash);
      if (!receipt) {
        try { await this.provider.broadcastTransaction(item.raw_transaction); }
        catch (error) {
          if (!await this.provider.getTransaction(item.transaction_hash)) throw error;
        }
        receipt = await this.provider.waitForTransaction(item.transaction_hash, this.config.confirmations, 30_000);
      }
      if (!receipt || receipt.status !== 1) throw new Error('Checkpoint transaction is pending or reverted');
      checkpoint = await this.anchor.checkpoints(id);
    }
    if (checkpoint.root.toLowerCase() !== item.root || Number(checkpoint.count) !== item.event_count) {
      throw new Error('On-chain checkpoint differs from accepted outbox');
    }
    const receipt = await this.receiptFor(item.id, checkpoint);
    this.store.confirmed(item.id, receipt);
    await this.backend(`/api/v1/trust/checkpoints/${encodeURIComponent(item.id)}/receipt`, { method: 'POST', body: JSON.stringify(receipt) });
    this.store.delivered(item.id);
  }

  async receiptFor(checkpointId, checkpoint) {
    const events = await this.anchor.queryFilter(this.anchor.filters.CheckpointAnchored(hashId(checkpointId)), Number(checkpoint.blockNumber), Number(checkpoint.blockNumber));
    if (events.length !== 1 || events[0].args.root !== checkpoint.root || events[0].args.count !== checkpoint.count) throw new Error('Anchor event missing or inconsistent');
    const receipt = await this.provider.getTransactionReceipt(events[0].transactionHash);
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== this.config.contractAddress.toLowerCase()) throw new Error('Invalid anchor transaction receipt');
    const block = await this.provider.getBlock(receipt.blockNumber);
    if (!block || block.hash !== receipt.blockHash) throw new Error('Receipt block is no longer canonical');
    const confirmations = await receipt.confirmations();
    if (confirmations < this.config.confirmations) throw new Error('Awaiting checkpoint confirmations');
    return {
      transaction_hash: receipt.hash, block_number: receipt.blockNumber, block_hash: receipt.blockHash,
      chain_id: this.config.chainId, contract_address: this.config.contractAddress,
      checkpoint_id: checkpointId, merkle_root: checkpoint.root, confirmations,
    };
  }

  async verify({ checkpoint_id: checkpointId, leaf, siblings }) {
    const root = proofRoot(leaf, siblings);
    await this.validateChain();
    const checkpoint = await this.anchor.checkpoints(hashId(checkpointId));
    if (checkpoint.root === `0x${'0'.repeat(64)}`) return { verified: false, reason: 'Checkpoint has not been anchored' };
    if (root !== checkpoint.root) return { verified: false, reason: 'Merkle proof does not match anchored root' };
    return { verified: true, root, receipt: await this.receiptFor(checkpointId, checkpoint) };
  }

  async backend(route, options = {}) {
    const response = await fetch(`${this.config.apiBaseUrl}${route}`, {
      ...options, headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Backend responded ${response.status}`);
    return response.status === 204 ? {} : response.json();
  }

  close() { this.provider.destroy(); }
}
