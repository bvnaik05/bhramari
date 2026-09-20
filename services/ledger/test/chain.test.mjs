import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { HDNodeWallet, JsonRpcProvider, NonceManager } from 'ethers';
import { deployContracts } from '../../../contracts/scripts/deploy.mjs';
import { RelayStore } from '../src/store.mjs';
import { Relayer } from '../src/relayer.mjs';
import { hashId, proofRoot } from '../src/merkle.mjs';

test('Relayer anchors real chain receipts, recovers callback failures and verifies membership', { timeout: 120_000 }, async (t) => {
  const require = createRequire(new URL('../../../contracts/package.json', import.meta.url));
  const suffix = process.platform === 'win32' ? 'win32-amd64' : `${process.platform}-${process.arch === 'x64' ? 'amd64' : 'arm64'}`;
  const executable = join(dirname(require.resolve(`@foundry-rs/anvil-${suffix}/package.json`)), 'bin', `anvil${process.platform === 'win32' ? '.exe' : ''}`);
  const rpcUrl = 'http://127.0.0.1:18548';
  const node = spawn(executable, ['--port', '18548', '--silent'], { windowsHide: true, stdio: 'ignore' });
  t.after(() => node.kill());
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(rpcUrl, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), headers: { 'Content-Type': 'application/json' } })).ok) break;
    } catch { /* Wait for the child RPC listener. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
  t.after(() => provider.destroy());
  const contracts = await deployContracts(new NonceManager(await provider.getSigner(0)));
  const first = hashId('accepted-event-1');
  const second = hashId('accepted-event-2');
  const checkpoint = { id: 'checkpoint-001', root: proofRoot(first, [second]), event_count: 2 };
  const token = 'test-service-token-at-least-32-characters';
  let callbacks = 0;
  let savedReceipt;
  const backend = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    if (request.method === 'GET') return response.end(JSON.stringify({ checkpoints: [checkpoint] }));
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    callbacks++;
    if (callbacks === 1) { response.statusCode = 503; return response.end('{}'); }
    savedReceipt = JSON.parse(Buffer.concat(chunks).toString());
    response.end('{}');
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => backend.close());
  const store = new RelayStore(':memory:');
  t.after(() => store.close());
  // This is Anvil's public test mnemonic, never a deployment credential.
  const privateKey = HDNodeWallet.fromPhrase('test test test test test test test test test test test junk').privateKey;
  const relayer = new Relayer({
    rpcUrl, chainId: 31337, confirmations: 1,
    contractAddress: contracts.EvidenceAnchor.target, privateKey, token,
    apiBaseUrl: `http://127.0.0.1:${backend.address().port}`,
  }, store);
  t.after(() => relayer.close());
  await relayer.poll();
  assert.match(relayer.lastError, /503/);
  assert.equal(store.get(checkpoint.id).state, 'confirmed');
  const blockAfterAnchor = await provider.getBlockNumber();
  await relayer.poll();
  assert.equal(relayer.lastError, null);
  assert.equal(store.get(checkpoint.id).state, 'delivered');
  assert.equal(await provider.getBlockNumber(), blockAfterAnchor);
  assert.equal((await provider.getTransactionReceipt(savedReceipt.transaction_hash)).status, 1);
  assert.equal(savedReceipt.merkle_root, checkpoint.root);
  assert.equal((await relayer.verify({ checkpoint_id: checkpoint.id, leaf: first, siblings: [second] })).verified, true);
  assert.equal((await relayer.verify({ checkpoint_id: checkpoint.id, leaf: hashId('tampered'), siblings: [second] })).verified, false);
  assert.equal((await relayer.verify({ checkpoint_id: 'unknown', leaf: first, siblings: [second] })).verified, false);
});
