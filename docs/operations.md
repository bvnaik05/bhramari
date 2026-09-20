# Bhramari operations runbook

## Start and observe

Copy `.env.example` to `.env`, replace every `change-me` value, then run
`docker compose up --build -d`. The user interface is at `localhost:3000`,
Keycloak at `localhost:8080`, Prometheus at `localhost:9090`, and Grafana at
`localhost:3001`. Never use the local realm passwords or Anvil key outside the
isolated prototype.

Check `GET /api/v1/health`, the ledger `GET /health`, container health, HTTP
error rate, latency, checkpoint age, pending offline events, disputes, evidence
expiry, duplicate scans, and active recalls. Page an operator if the API or
ledger is unavailable for five minutes, rejected sync rises unexpectedly, or
no checkpoint anchors while accepted events are pending.

## Backup and recovery

Run `./scripts/backup.ps1` from the repository root. It creates a PostgreSQL
custom dump plus encrypted evidence, relayer, object-store, and Keycloak volume
archives. The manifest contains a SHA-256 checksum for every file. Store the
backup in access-controlled storage separate from the host.

Test recovery quarterly in an isolated environment:

```powershell
./scripts/restore.ps1 -Source backups/20260920-120000 -ConfirmRestore
```

After recovery, verify login, one private evidence download, one bottle
Passport, the latest anchored proof, and the pending sync count. Record the
recovery time and any missing checkpoint receipts.

## Incident response

1. Preserve logs and affected IDs. Do not delete disputed records.
2. Contain the incident: revoke a device, disable a Keycloak account, hold the
   affected lot, or stop the relayer as appropriate.
3. Check signed envelopes, audit events, object hashes, Merkle proofs, and chain
   receipts. Treat sensor and QR anomalies as review signals.
4. Rotate exposed OIDC, evidence, Passport, relayer, database, and provider
   credentials. Reissue affected signing keys and revoke old device keys.
5. Restore only from a checksum-verified backup. Append corrections or recalls;
   never rewrite accepted provenance.
6. Notify affected operators and data owners under the pilot response policy.
   Document scope, decisions, recovery, and prevention work.

If the chain is unavailable, keep accepting validated events into pending
checkpoints and show “Needs online refresh.” If chain integrity is in doubt,
pause the relayer and Passport “Verified record” claims until governance
members reconcile the checkpoint receipts.
