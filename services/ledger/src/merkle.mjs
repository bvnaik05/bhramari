import { createHash } from 'node:crypto';

export function hashId(id) {
  if (typeof id !== 'string' || !id || id.length > 200) throw new Error('Invalid checkpoint ID');
  return `0x${createHash('sha256').update(id, 'utf8').digest('hex')}`;
}

export function hashHex(value) {
  if (typeof value !== 'string' || !/^(0x)?[a-f\d]{64}$/i.test(value)) throw new Error('Expected a SHA-256 hex digest');
  return `0x${value.replace(/^0x/i, '').toLowerCase()}`;
}

export function proofRoot(leaf, siblings) {
  if (!Array.isArray(siblings) || siblings.length > 32) throw new Error('Invalid Merkle proof');
  let current = hashHex(leaf);
  for (const sibling of siblings) {
    const pair = [current, hashHex(sibling)].sort().map((value) => Buffer.from(value.slice(2), 'hex'));
    current = `0x${createHash('sha256').update(Buffer.concat(pair)).digest('hex')}`;
  }
  return current;
}
