import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashId, proofRoot } from '../src/merkle.mjs';
import { RelayStore } from '../src/store.mjs';
import { createLedgerServer } from '../src/server.mjs';

test('Sorted SHA-256 proofs match byte-concatenated backend trees and reject mutation', () => {
  const first = hashId('event 1');
  const second = hashId('event 2');
  const expected = `0x${createHash('sha256').update(Buffer.concat([first, second].sort().map((value) => Buffer.from(value.slice(2), 'hex')))).digest('hex')}`;
  assert.equal(proofRoot(first, [second]), expected);
  assert.equal(proofRoot(second, [first]), expected);
  assert.notEqual(proofRoot(hashId('tampered'), [second]), expected);
  assert.throws(() => proofRoot('invalid', []));
  assert.throws(() => proofRoot(first, Array(33).fill(second)));
});

test('Outbox survives restart, prevents ID substitution and clears signed material after delivery', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bhramari-ledger-'));
  const filename = join(directory, 'test.sqlite');
  let store = new RelayStore(filename);
  try {
    store.enqueue({ id: 'checkpoint', root: hashId('event'), event_count: 1 });
    store.signed('checkpoint', '0xsigned', '0xtx');
    store.close();
    store = new RelayStore(filename);
    assert.equal(store.pending()[0].raw_transaction, '0xsigned');
    assert.throws(() => store.enqueue({ id: 'checkpoint', root: hashId('changed'), event_count: 1 }));
    store.confirmed('checkpoint', { transaction_hash: '0xtx' });
    store.delivered('checkpoint');
    assert.equal(store.pending().length, 0);
    assert.equal(store.get('checkpoint').raw_transaction, null);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

test('Verification API rejects unauthenticated calls and malformed payloads', async (t) => {
  const relayer = { config: { chainId: 31337 }, lastError: null, verify: ({ leaf, siblings }) => ({ verified: Boolean(proofRoot(leaf, siblings)) }) };
  const token = 'local-test-secret-of-at-least-32-characters';
  const server = createLedgerServer(relayer, token);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (headers, payload) => fetch(`${base}/api/v1/trust/verify`, { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal((await request({}, {})).status, 401);
  assert.equal((await request({ Authorization: `Bearer ${token}` }, { leaf: 'invalid', siblings: [] })).status, 400);
  const accepted = await request({ Authorization: `Bearer ${token}` }, { leaf: hashId('event'), siblings: [] });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).verified, true);
});
