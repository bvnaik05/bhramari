# Bhramari trust-ledger

Node.js 22.13+ and Ethers v6 relay the traceability API's transactional outbox to `EvidenceAnchor`. The service stores its delivery journal in SQLite, independently of the core database. No synthetic receipt is produced when RPC is offline.

After deploying contracts, configure the environment shown in `.env.example`, then run:

```sh
npm start --workspace services/ledger
npm test --workspace services/ledger
```

The service does not load `.env` implicitly. Export variables in your shell or provide them through Compose. The API and ledger must share the same random `BHRAMARI_RELAYER_TOKEN`. The funded `RELAYER_PRIVATE_KEY` must have `ANCHOR_ROLE`. One process owns each signer/journal. Run multiple independent signers only with separate journals.

Every poll calls authenticated `GET /api/v1/trust/pending` on `API_BASE_URL`. The response is `{"checkpoints":[{"id":"…","root":"64 hex characters","event_count":2}]}`. The service validates the shape, rejects a reused ID with different contents, signs one transaction and saves its raw bytes before broadcast. Restart retries the same transaction or reconciles an existing on-chain anchor. The raw signed transaction is deleted after delivery.

After a successful transaction, the indexer checks the contract event, receipt status, destination, canonical block hash, root, count and configured confirmation count. It then calls `POST /api/v1/trust/checkpoints/{id}/receipt` with `transaction_hash`, `block_number`, `block_hash`, `chain_id`, `contract_address`, `checkpoint_id`, `merkle_root` and `confirmations`. Callback failures retry without anchoring twice.

`GET /health` gives service state without secrets. Authenticated `POST /api/v1/trust/verify` accepts `{"checkpoint_id":"…","leaf":"…","siblings":["…"]}`. It recalculates the SHA-256 proof and checks the current chain plus receipt. A changed event, absent checkpoint, insufficient confirmation or unavailable RPC cannot return `verified: true`. Public Passport requests should use the backend's public projection, never expose the service token.

Unit tests check Merkle mutation, durable idempotence and API authentication. The chain integration test starts Anvil on port 18548 and proves actual anchoring, callback recovery, no duplicate transaction and proof verification. Reorg safety uses confirmation depth and verification against the current canonical block; a pilot must set an appropriate depth and run chain health alerts. SQLite is the local single-worker journal; use a managed encrypted volume and back up both it and the core outbox for a pilot.
