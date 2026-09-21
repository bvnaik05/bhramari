# Implementation and acceptance ledger

This ledger separates implemented behavior from simulated validation and
external deployment work. A screen alone does not count as a completed
workflow.

| Feature | Acceptance evidence | State |
| --- | --- | --- |
| Identity and permissions | OIDC/JWKS, organization boundaries, consent, revoke and atomic key rotation | Working prototype |
| Field records | SQLCipher vault, Keychain/Keystore secret, Ed25519 signature, UUIDv7, sequence/hash chain, cached context and restart-safe queue | Working prototype |
| Traceability | Integer mass balance, split/aggregate/transform, append-only correction, lineage, custody, shipment and packaging | Working prototype |
| Evidence and recalls | Encrypted objects, content hash, active-PDF rejection, ClamAV boundary, authorization and descendant restriction | Working prototype |
| Trust ledger | Seven contracts, Foundry fuzz/invariant tests, Anvil transactions, Merkle proof, durable relayer outbox and immutable receipt binding | Working prototype |
| Public Passport | No-login live status, privacy projection, serial certificate, duplicate signal, concern report, proof and selected-language audio | Working prototype |
| Madhu | Role/context checks, deterministic tools, source date, draft confirmation, escalation and provider translation/speech adapters | Working prototype |
| Inclusive access | Farmer Card, delegation, farmer confirmation and signed agent attestation | Simulated validation |
| Hive Economy | Honey/beeswax inventory, evidence-first requirement matching, enquiry, quotation and reservation | Working prototype |
| Bee Circles | Questions, mentor request and conflict-safe shared-equipment booking | Working prototype |
| Intelligence | Reading ingestion, deterministic sensor simulator, missing/stuck/rate alerts and human acknowledgement | Simulated validation |
| Web application | Responsive landing, role workspaces, control tower and public Passport production build | Working prototype |
| Native field app | Android/iOS source, encrypted offline harvest/inspection, queue, Madhu voice/text, demand and mentor journeys | Working prototype; physical low-end Android validation pending |
| Operations | Compose, Keycloak realm, PostgreSQL, MQTT, object store, ClamAV, Prometheus/Grafana, backup/restore, CI, CodeQL, dependency/secret/container scan and SBOM | Implemented configuration; full Compose boot pending on a Docker host |

## Automated validation

- FastAPI: 21 tests pass. They cover tenant isolation, replay/idempotency,
  tampering, evidence quarantine, quantity conservation, recall inheritance,
  receipt binding, public privacy, key rotation and append-only correction.
- Solidity: 7 Foundry tests pass, including 256-run fuzz properties and a
  4,096-call conservation invariant.
- Relayer: 4 tests pass against a real local Anvil chain, including callback
  recovery, durable outbox restart, proof mutation and authentication.
- Web: TypeScript checking and the Next.js production build pass for landing,
  workspace and dynamic Passport routes.
- Flutter: analyzer and canonical JSON test pass. APK packaging needs an Android
  SDK, which is not installed on the current workstation.
- Compose, Keycloak and monitoring configuration parse successfully. Docker is
  not installed on the current workstation, so container startup is not claimed.

## External configuration

Live Sarvam or ElevenLabs speech requires provider credentials. The language
catalog is loaded through the API capability manifest and can be replaced with
`BHRAMARI_LANGUAGE_MANIFEST`; application intent logic does not contain a
fixed Hindi/Marathi language branch. Languages without a configured TTS route
keep text and supported speech input available.

The checked-in Keycloak users, passwords, Anvil key, laboratory evidence,
telephony request and sensor feed are local competition fixtures. Replace them
for a controlled pilot. Multi-party Besu governance, live telephony, validated
pollen/acoustic models, satellite intelligence, finance, additional hive
products and national rollout remain roadmap items exactly as scoped in the
canonical plan.

Each implementation group was committed and pushed through terminal Git using
the repository owner's configured identity. No collaborator or co-author
trailer was added.
