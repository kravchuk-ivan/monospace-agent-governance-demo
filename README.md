# Riverside Health × Monospace: governed AI agents on HIPAA and PCI data

A runnable demo of [Monospace](https://monospace.io) v1.1.0 (by Directus). A three-clinic healthcare network keeps patient records in **PostgreSQL** (HIPAA) and card payments in a separate **MySQL** billing system (PCI DSS cardholder data environment). It wants two AI agents on that live data: a **front-desk agent** and a **billing agent**.

Monospace puts one governed API in front of both databases. The API comes as REST, a typed SDK and MCP, and each agent gets its own identity and least-privilege policy, with guardrails that hold even for admins.

```
                 Claude / any MCP client          TypeScript app (typed SDK)
                         │  POST /api/riverside/mcp        │  /api/riverside/items/*
                         ▼                                 ▼
        ┌──────────────────────────── Monospace ─────────────────────────────┐
        │ identity (user / service account) → role → policy                  │
        │   itemRules (row filters) · fieldRules · validationRules · ai:mcp  │
        │ source access: no deletes · Payments schema locked                 │
        │ cross-source relations: patient↔billingAccount, appointment↔charge │
        └───────────────┬────────────────────────────────────┬───────────────┘
                        ▼ live queries, nothing copied       ▼
        EHR · PostgreSQL (HIPAA)                  Payments · MySQL (PCI DSS CDE)
        clinics, providers, patients,             billing_accounts, payment_methods,
        appointments                              charges, refunds
```

## Run it

Needs Docker (Colima works) and Node 22+.

```bash
npm install
npm run up                                   # 7 containers; Monospace on :8100
MONOSPACE_ACCEPT_TERMS=yes npm run setup     # first run: creates admin, accepts Monospace Terms
npm run demo                                 # the 6-beat run-of-show (Enter between beats)
```

| Command | What it does |
|---|---|
| `npm run setup` | Workspace, both sources, cross-database relations, agent identities and policies, keys. Writes `.env.local` and `.mcp.json`. Safe to re-run. |
| `npm run demo` / `demo:fast` | The run-of-show over MCP and REST against live data. See [DEMO.md](DEMO.md). |
| `npm run policies:check` | Validates `governance/*.json` against the engine and prints the access matrix (agent × field, both databases). |
| `npm run sdk:generate` | Downloads the workspace OpenAPI and generates the typed client into `app/generated/`. |
| `npm run app [front-desk\|billing]` | Typed patient-360 query across both databases, under the chosen key. |
| `npm run reset` | Wipes all volumes and rebuilds from scratch. |

- **Studio:** http://localhost:8100, login `admin@riverside.example` / `RiversideDemo2026!`
- **Claude Code:** run `claude` in this folder, approve the `riverside-*` MCP servers, and ask for example "What is Maria Alvarez's next appointment and does she owe anything?"
- **Databases:** `psql postgres://ehr_admin:ehr_admin@localhost:5433/ehr`, `mysql -h127.0.0.1 -P3307 -uroot -ppayments_root payments`

## License: what works without a key

The keyless install runs on Monospace's **Starter** plan: 1 workspace, 3 seats, **0 custom roles, 0 custom policies, 0 service accounts, no audit logs, no custom permission rules**.

| Demo beat | Starter (tonight) | With a license key |
|---|---|---|
| 1. Shared admin key sees SSNs and card numbers | ✅ live | ✅ |
| 2. One API over Postgres + MySQL, cross-database relations | ✅ live | ✅ |
| 3. Source guardrails: no deletes, Payments schema locked (admins too) | ✅ live | ✅ |
| 4. Per-agent identity + row/field/validation rules | ⚠️ policies validated by the engine, refused with 402 | ✅ enforced (script ready, untested) |
| 5. Revoke a key, next call 401 | ✅ live | ✅ |
| 6. Audit log | ❌ not on Starter | ✅ in Studio |

To enforce the agent policies, put `MONOSPACE_LICENSE__KEY=...` in `license.env` (never an empty value), run `docker compose up -d`, then `npm run setup`. Setup then creates a service account, role, policy and 30-day key per agent, and beat 4 of the demo runs the agents for real.

## Layout

```
docker-compose.yml        Monospace stack (official quickstart) + EHR Postgres + Payments MySQL
db/generate.mjs           deterministic synthetic data → db/ehr/*.sql, db/payments/*.sql
governance/*.json         agent policies as code, with the HIPAA / PCI rationale per rule
scripts/                  setup, demo, policy check, SDK generation
app/patient-360.ts        typed SDK example
DEMO.md                   run-of-show and talk track
docs/STUDY-GUIDE.md       how Monospace works, verified hands-on, and product feedback
```

All data is synthetic. Card numbers are public test PANs.
