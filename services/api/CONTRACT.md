# Bhramari API v1

Base `/api/v1`. Private routes require `Authorization: Bearer <access_token>`.
Dates are ISO UTC. Quantities are integer grams. JSON keys are snake_case.
Error shape is FastAPI `{detail: string | validationErrors}`. Lists return arrays.

## Identity

Explicit `BHRAMARI_DEMO=true` enables `POST /auth/demo` with `{email,password}`.
Email is `beekeeper|fpo|processor|lab|buyer|admin` at `bhramari.local`; password `demo-honey-2026`.
Response `{access_token,token_type,expires_in,user:{id,name,email,org_id,role},mode}`.
`GET /auth/me`, `GET /auth/organisations`. Production uses OIDC bearer tokens and server-enrolled users.

## Field and lots

- `GET/POST /hives` create `{name,region,floral}`. Response `{id,name,region,floral,status,org_id,created_at}`.
- `GET/POST /hives/{id}/inspections` create `{observation,status:'healthy'|'attention'|'urgent',queen_seen?,frames?}`.
- `GET /lots`: `{id,code,product,quantity_g,available_g,owner_org_id,source_hive_id,status,region,floral,method,created_at}`[].
- `POST /lots/harvest`: `{hive_id,product:'honey'|'beeswax',quantity_g,floral,notes}` -> lot.
- `POST /lots/operations`: `{operation:'split'|'aggregate'|'transform',inputs:[{lot_id,quantity_g}],outputs:[{product,quantity_g}],loss_g,method}` -> `{operation_id,lots}`.
- `GET /lots/{id}/lineage` -> `{lot,ancestors,edges,evidence,custody}`.
- `POST /custody`: `{lot_id,to_org_id,note}`. `GET /custody` lists parties' proposals.
- `POST /custody/{id}/decision`: recipient only `{decision:'accepted'|'disputed',note}`.
- `POST /shipments`: `{lot_id,custody_id,destination,carrier,tracking_reference}`. `POST /shipments/{id}/receive`.
- `POST /lots/{id}/restriction`: quality/admin `{status:'held'|'recalled',reason}` -> descendants affected.
- `POST /lots/pack`: `{lot_id,bottle_count,grams_per_bottle}` -> `{bottles:[{serial,lot_id,quantity_g,certificate,resolver_url}]}`.
- `POST /evidence`: JSON `{lot_id,kind:'laboratory'|'inspection'|'storage',title,content_base64,content_type:'application/pdf'|'text/plain'|'application/json',expires_at:'ISO date',summary:{...}}`.
- `GET /evidence/{id}/content`: authenticated scoped verified download.
- `GET /dashboard`: authenticated inventory, exceptions and trust totals.

## Signed offline sync

Register `POST /devices` with `{name,public_key}` (base64 raw Ed25519 32-byte key). Returns `{id,...}`; DELETE revokes, new registration rotates.
`POST /sync` body `{events:[envelope]}`. Envelope (including payload) is sorted-key compact UTF-8 JSON, signed **without signature**; Ed25519 signature standard base64. Payload hashes SHA256 of same canonical JSON. Strings NFC should be normalized by client; no floating point quantities.

Envelope: `{schema_version:1,event_id:UUIDv7,actor_id,organisation_id,event_type:'harvest'|'inspection',subject_id:hiveID,occurred_at:ISO UTC,device_sequence:1,previous_event_hash:'',payload_hash:hex,attachment_hashes:[],key_id:registeredDeviceID,capture_mode:'OFFLINE',payload:harvestOrInspectionBody,signature:base64}`.
Next `previous_event_hash` hashes the prior unsigned envelope. Sequence advances on signed domain conflicts too; results record disputed requests for review. Invalid signatures never advance. Retry with identical event ID and content returns prior receipt; changed content is rejected.
Response `{receipts:[{event_id,status:'accepted'|'disputed'|'rejected',...}]}`.

## Public and trust

`GET /passport/BHR-2026-0001` no authentication; returns origin, evidence summaries, journey, live status, signed certificate and proof. Exact coordinates, contact details, private notes and source payloads are excluded.
`POST /passport/{serial}/scan` `{region:'Pune, Maharashtra',client_nonce:UUID}` -> risk and current passport. No precise GPS required.
`POST /passport/{serial}/concerns` `{category,description}` creates review request.
`GET /trust/issuer-key` publishes Ed25519 verification key. `GET /trust/events/{id}/proof` exposes hashes and inclusion proof only.
Relayer secret is separate: `GET /trust/pending` returns `{checkpoints:[{id,root,event_count}]}`. `POST /trust/checkpoints/{id}/receipt` accepts `{transaction_hash,block_number,chain_id,contract_address,block_hash?,checkpoint_id?,merkle_root?,confirmations?}`.
Merkle leaves are SHA256 event JSON. Parent = SHA256(sorted pair bytes concatenated), duplicate odd final leaf.
