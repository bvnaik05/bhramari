import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { JsonRpcProvider, NonceManager, id, sha256, toUtf8Bytes } from 'ethers';
import { deployContracts } from '../scripts/deploy.mjs';

const require = createRequire(import.meta.url);
const suffix = process.platform === 'win32' ? 'win32-amd64' : `${process.platform}-${process.arch === 'x64' ? 'amd64' : 'arm64'}`;
const executable = join(dirname(require.resolve(`@foundry-rs/anvil-${suffix}/package.json`)), 'bin', `anvil${process.platform === 'win32' ? '.exe' : ''}`);

test('Anvil lifecycle: harvest, consented custody, exact split, evidence, inherited recall', { timeout: 120_000 }, async (t) => {
  const port = 18547;
  const node = spawn(executable, ['--port', String(port), '--silent'], { windowsHide: true, stdio: 'ignore' });
  t.after(() => node.kill());
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), headers: { 'Content-Type': 'application/json' } });
      if (response.ok) break;
    } catch { /* Node startup races the first connection. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`, undefined, { cacheTimeout: -1 });
  t.after(() => provider.destroy());
  const admin = new NonceManager(await provider.getSigner(0));
  const farmer = new NonceManager(await provider.getSigner(1));
  const packer = new NonceManager(await provider.getSigner(2));
  const contracts = await deployContracts(admin, { adminAddress: await packer.getAddress() });
  const { HoneyAccessManager: access, ParticipantRegistry: participants, BatchRegistry: batches, CustodyChain: custody, BlendRegistry: blend, EvidenceAnchor: evidence, RecallRegistry: recall } = contracts;
  assert.equal((await access.pendingDefaultAdmin())[0], await packer.getAddress());
  for (const role of ['REGISTRAR_ROLE', 'RECALL_ROLE']) await (await access.grantRole(await access[role](), await admin.getAddress())).wait();
  for (const signer of [farmer, packer]) {
    await (await participants.register(await signer.getAddress(), id('org'), id('private evidence'))).wait();
    await (await access.grantRole(await access.OPERATOR_ROLE(), await signer.getAddress())).wait();
  }
  await (await access.grantRole(await access.PRODUCER_ROLE(), await farmer.getAddress())).wait();
  const source = id('harvest-001');
  await (await batches.connect(farmer).harvest(source, 18000, 1, id('inspection'))).wait();
  const expiry = (await provider.getBlock('latest')).timestamp + 3600;
  await (await custody.connect(farmer).propose(id('handover'), source, await packer.getAddress(), expiry, id('proposal'))).wait();
  assert.equal(await batches.custodianOf(source), await farmer.getAddress());
  await (await custody.connect(packer).accept(id('handover'), id('receipt'))).wait();
  const pack = id('pack-001');
  await (await blend.connect(packer).transform(id('split'), [source], [18000], [[pack, 17500, 1]], 500, id('process loss'))).wait();
  assert.equal((await batches.batches(source)).available, 0n);
  assert.deepEqual(Array.from(await batches.getAncestors(pack)), [source]);
  const leaf = sha256(toUtf8Bytes('accepted-event'));
  await (await evidence.anchorCheckpoint(id('checkpoint'), leaf, 1)).wait();
  assert.equal(await evidence.verifyInclusion(id('checkpoint'), leaf, []), true);
  await (await recall.setStatus(source, 2, id('authority decision'))).wait();
  assert.equal(await recall.effectiveStatus(pack), 2n);
  await assert.rejects(batches.requireUsable(pack), /Restricted batch/);
});
