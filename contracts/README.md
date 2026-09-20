# Bhramari trust contracts

Seven non-upgradeable Solidity contracts implement participant permission, lot quantity, transformation lineage, two-party custody, evidence anchoring and inherited hold/recall. Quantities are integer grams. Product IDs are `1` for honey and `2` for beeswax. Only opaque IDs, addresses and hashes go on-chain.

```sh
npm install
npm run compile --workspace contracts
npm test --workspace contracts
npm run test:integration --workspace contracts
npm run anvil --workspace contracts
# In another terminal:
npm run deploy --workspace contracts
```

The npm scripts select the native Foundry binary for Windows, Linux or macOS. Direct `forge test` also works after installing Foundry and dependencies at the repository root. The tests include 256-case quantity fuzzing, a 128-run stateful conservation invariant, access checks, custody, evidence mutation and descendant recall. The integration test launches its own Anvil on port 18547.

Deployment uses unlocked account zero only when RPC chain ID is 31337. Other chains require `DEPLOYER_PRIVATE_KEY`. `RPC_URL`, `RELAYER_ADDRESS` and `ADMIN_TRANSFER_DELAY` are optional. The default admin-transfer delay is two days. The deployment manifest contains addresses and chain ID, never keys.

The administrator grants registrar, producer, operator, laboratory, recall and anchor roles. A registrar registers each participant's organisation and consent/evidence hash. Producers can create source lots. Operators may consume only lots they hold. A transform atomically consumes input quantities and creates outputs with exact `input = output + recorded loss`. Duplicate input IDs, replayed operation IDs, overdraw, cycles through existing IDs and mass inflation revert. Lineage is immutable. Derived lots carry all ancestors, so a later hold or irreversible recall applies immediately to every descendant.

Custody proposal and receipt require separate eligible accounts. Revoked parties cannot complete a handover. A pending handover locks input consumption until accepted, disputed or cancelled. Acceptance transfers all remaining quantity. A participant must explicitly cancel an expired proposal before consuming the lot. Each transformation accepts at most 16 inputs/outputs and 128 unique ancestors per output. These documented limits bound gas and keep recall queries usable.

`EvidenceAnchor` records immutable laboratory evidence hashes and SHA-256 Merkle roots. Evidence can be revoked with a separate audit event. Backend checkpoint IDs map to `sha256(UTF8(id))`. Merkle siblings are sorted as 32-byte values, concatenated and hashed with SHA-256. The proof supports the API's canonical-JSON SHA-256 event leaves.

The local demo is an Anvil development chain. A pilot requires independent contract review, institutional validator governance and an administrator multisig controlled by a timelock. The included delayed two-step admin transfer is not a substitute for that governance. No upgrade key can rewrite these contracts. Blockchain records accepted evidence; it cannot establish chemical purity or the truth of a physical observation.
