# KVIC cluster deployment pack

Use this pack for one controlled Honey Chain cluster. A cluster contains one
FPO or producer group, one laboratory, one processor, and 20–50 beekeepers.
Do not use the local demo credentials, Anvil key, or simulated evidence.

## Ownership

| Role | Owner | Main duties |
| --- | --- | --- |
| Program owner | KVIC or sponsoring institution | Approve the cluster, budget, policies, and success measures |
| Cluster owner | FPO or producer group | Enroll beekeepers, operate the help desk, and resolve field exceptions |
| Quality owner | Approved laboratory | Issue evidence and review quality or disease-risk escalations |
| Ledger governors | KVIC, FPO, laboratory, and processor | Control the administrator multisignature account and reconcile checkpoints |
| Technical operator | Named deployment partner | Operate services, backups, monitoring, upgrades, and incident response |
| Data steward | Named cluster officer | Approve consent purposes, retention, exports, and access reviews |

The program owner must record names and contact routes before onboarding starts.
One person can hold multiple pilot roles, except the ledger needs independent
multisignature approvers.

## Minimum equipment

| Item | Pilot quantity | Minimum profile |
| --- | ---: | --- |
| Application host | 1 | Linux, 4 vCPU, 16 GB RAM, 100 GB SSD, daily backup target |
| Operator laptop | 1 | Current browser, disk encryption, supported operating system |
| Android phone | 1 per field agent | Android 10 or later, secure lock, 3 GB RAM, camera, microphone |
| Instrumented hive kit | 3–5 | ESP32, temperature, humidity, load cell, local buffer, calibration record |
| Label printer | 1 | Unique QR output with tamper-evident label stock |
| Power protection | 1 | UPS sized for the host, router, and label printer |
| Connectivity | 2 paths | Primary broadband or 4G plus a second operator for recovery |

Existing beekeeper phones can use the field application after the low-end
device check passes. Do not make hardware purchase claims from this table.
Get local quotations before budget approval.

## Cost model

Record all values in rupees and keep the supplier quotation with the pilot file.

```text
one_time_cost = hive_kits + label_printer + label_stock + power_protection
              + setup_labour + training + travel + security_review

monthly_cost = host + backup_storage + domain_and_tls + connectivity
             + support_labour + voice_usage + replacement_allowance

pilot_cost = one_time_cost + monthly_cost * pilot_months
cost_per_beekeeper = pilot_cost / active_beekeepers
cost_per_verified_batch = pilot_cost / verified_batches
```

The budget owner must include taxes, shipping, calibration, repairs, and a
10 percent contingency. Recalculate the two unit costs every month. Scale only
after both unit costs and support effort stay within the approved limit.

## Onboarding procedure

1. Assign the owners in the ownership table.
2. Create a cluster ID, region, language list, and support contact.
3. Approve consent, retention, dispute, recall, and incident policies.
4. Copy `deploy/participants.json` and add the approved organizations and OIDC subjects.
5. Create production secrets in the deployment secret store.
6. Set a nonzero `ADMIN_TRANSFER_DELAY` and the approved multisignature administrator.
7. Start the stack with `docker compose up --build -d` on the pilot host.
8. Check the API, ledger, database, object store, Keycloak, Prometheus, and Grafana health.
9. Enroll field devices and record each device owner and recovery contact.
10. Calibrate each sensor against a reference and store the calibration result.
11. Print and scan a test label before issuing production serials.
12. Run one offline harvest, custody transfer, evidence issue, package, Passport, and recall drill.
13. Run backup and restore before the first production batch.
14. Record the acceptance results and approve the go-live date.

## Pilot capacity

The first cluster supports 20–50 beekeepers, up to 200 registered hives, five
instrumented hives, and one FPO, laboratory, and processor. These are operating
limits, not measured performance claims.

Add another cluster deployment when legal ownership or support responsibility
must stay separate. Move to shared regional infrastructure only after load,
tenant isolation, backup, and recovery tests pass with representative data.

## Acceptance gates

- Every test bottle resolves to its source lot and current safety state.
- Offline retry does not duplicate a harvest.
- A quantity conflict remains visible for review.
- A recall reaches all descendant lots and packaged bottles.
- A duplicate scan reaches the lot owner and the control tower.
- Sensor risk names the detected pattern and requires a field inspection.
- Productivity forecasts show the horizon, confidence, and data requirement.
- The administrator belongs to the approved multisignature account.
- A backup restores the latest private evidence and ledger receipt.
- The low-end Android launch and offline journey pass on the selected device.

## Service and escalation

| Event | Owner | Response target | Escalation |
| --- | --- | --- | --- |
| Safety or recall | Quality owner | Immediate acknowledgement | Program owner and affected supply partners |
| Disputed custody or quantity | Cluster owner | Assign within 4 working hours | Program owner after 2 working days |
| Disease-risk signal | Cluster owner | Arrange inspection within 1 working day | Quality owner or qualified mentor |
| API or ledger outage | Technical operator | Start work within 30 minutes | Program owner after 2 hours |
| Privacy or key incident | Data steward | Contain immediately | Program owner and required authorities |

Use the detailed recovery steps in `docs/operations.md`. Preserve all disputed
records and append the resolution. Do not rewrite accepted provenance.

## Scale decision

At the end of the pilot, report active beekeepers, verified batches, offline
success, exception age, evidence freshness, forecast error, support hours, and
cost per verified batch. Expand only when the program owner accepts the results
and funds the next cluster.
