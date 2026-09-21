# Bhramari

Honey traceability and smart beekeeping management for **Smart India Hackathon, SIH26021**.

Bhramari joins signed offline field records, accountable lot genealogy, laboratory evidence, blockchain checkpoints, and public bottle passports. Honey and beeswax share one inventory model. Madhu, assisted access, and Bee Circles support inclusive participation.

The implementation follows [the canonical scope](docs/canonical-plan.md). Production consortium governance, national telephony, validated pollen/acoustic models, and credit products remain pilot or research work, as the plan specifies.

Blockchain verifies record integrity. It does not prove chemical purity. Sensor alerts support screening and human review.

## Run the complete local stack

1. Copy `.env.example` to `.env` and replace every `change-me` value.
2. Run `docker compose up --build -d` on a Docker host.
3. Open `http://localhost:3000`. Keycloak is on port 8080, Grafana on 3001,
   Prometheus on 9090, and the API on 8000.

The imported local users are `beekeeper`, `fpo`, `processor`, `lab`, `buyer`,
and `admin`; their local-only password is `bhramari-local`. The realm requires
authorization code with PKCE and disables password grants. Do not use fixture
credentials or the Anvil key outside the isolated prototype.

## Validate

```powershell
./.venv/Scripts/python.exe -m pytest -q services/api
npm test --prefix contracts
npm test --prefix services/ledger
npm run typecheck --prefix apps/web
npm run build --prefix apps/web
Push-Location apps/field; flutter analyze; flutter test; Pop-Location
```

See [the acceptance ledger](docs/implementation-status.md),
[operations runbook](docs/operations.md), and
[six-minute demonstration](docs/demo-script.md) for deployment boundaries and
the verified journey.
