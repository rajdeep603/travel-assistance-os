# Travel Assistance AI Platform

**AI-powered automation for travel assistance and healthcare operations.**

A working demonstration platform built for ITIC Global. Six modules show how AI
slots into an assistance company's daily operations — every workflow is real
(live database, real document processing, real bookings), and **all data is
fictional demo data**.

> This is a demonstration/prototype platform. It is not a production medical
> decision-making system and never gives medical advice.

## The six modules

| Module | What it demonstrates |
|---|---|
| **Medical Document AI** | Upload a medical PDF → text extraction → AI classification → structured extraction → summary → missing-information flags |
| **AI Case Manager** | Paste an assistance request → AI extracts patient, location, issue, urgency → one click creates a real case |
| **Claims Automation** | Upload claim documents → classification → extraction → completeness check → human review actions (approve / request info / escalate) |
| **Provider Search** | Match demo providers on specialty, language, availability and distance, with "why this provider" reasoning and real slot booking |
| **Internal AI Assistant** | Lightweight RAG over an operational knowledge base + live case/provider lookups, with sources |
| **AI Voice Medical Assistance Agent** | Browser-based voice agent that collects details, searches providers, confirms, **books a real appointment**, creates a case and hands off to a human case manager |

## Quick start (development)

Prerequisites: Node.js 22+, Docker Desktop.

```bash
cp .env.example .env            # defaults work for local development
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL on port 5434
npm install
npx prisma migrate deploy       # apply schema
npm run demo:pdfs               # generate fictional demo PDFs
npm run db:seed                 # idempotent demo data seed
npm run dev                     # http://localhost:3000
```

## Quick start (production stack, locally)

```bash
cp .env.example .env            # set a real POSTGRES_PASSWORD
docker compose up -d --build    # nginx → app → postgres
curl http://localhost/api/health
```

Migrations run automatically on container start; set `AUTO_SEED=true` (default)
to seed demo data.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm test` | Unit + integration tests (needs the dev database) |
| `npm run test:e2e` | End-to-end tests against a running app (`E2E_BASE_URL` overridable) |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / seed demo data |
| `npm run demo:pdfs` | Regenerate the fictional demo PDFs |

## AI configuration

The platform runs fully offline by default using a deterministic demo AI
provider, so demos never depend on network or API quotas. To use the live
Claude API instead, set `AI_API_KEY` in `.env` — the deterministic provider
remains as an automatic fallback if the API call fails. See
[ENVIRONMENT.md](ENVIRONMENT.md).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, service interfaces, data model
- [DEPLOYMENT.md](DEPLOYMENT.md) — first-time EC2 deployment, CI/CD, rollback
- [infra/terraform](infra/terraform/README.md) — one-command EC2 provisioning (VPC, EIP, bootstrap)
- [TESTING.md](TESTING.md) — test suites and how to run them
- [DEMO_GUIDE.md](DEMO_GUIDE.md) — how to run the ITIC demo conversation
- [ENVIRONMENT.md](ENVIRONMENT.md) — every environment variable explained

## Positioning

We help travel assistance and healthcare companies add AI automation to their
existing operations — not replace their software. **Give us one manual
workflow and we can build an AI-powered pilot around it.** This platform
exists to open that conversation.
