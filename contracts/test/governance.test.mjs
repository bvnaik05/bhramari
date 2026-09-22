import test from 'node:test';
import assert from 'node:assert/strict';

import { validateGovernance } from '../scripts/deploy.mjs';

const multisig = '0x0000000000000000000000000000000000000001';

test('pilot governance requires a multisig and transfer delay', () => {
  assert.doesNotThrow(() => validateGovernance({ mode: 'demo', adminDelay: 0 }));
  assert.throws(() => validateGovernance({ mode: 'pilot', adminDelay: 172800 }), /ADMIN_MULTISIG_ADDRESS/);
  assert.throws(() => validateGovernance({ mode: 'pilot', adminDelay: 0, adminAddress: multisig }), /at least 86400/);
  assert.doesNotThrow(() => validateGovernance({ mode: 'pilot', adminDelay: 86400, adminAddress: multisig }));
});
