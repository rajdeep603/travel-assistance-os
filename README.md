# Travel Assistance AI Platform

**AI-powered automation for travel assistance and healthcare operations.**

A working demonstration platform built for ITIC Global. It shows how AI slots
into an assistance company's daily operations — every workflow is real (live
database, real document processing, real bookings, real phone calls), and
**all data is fictional demo data**.

> This is a demonstration/prototype platform. It is not a production medical
> decision-making system and never gives medical advice.

## Modules

| Module | What it demonstrates |
|---|---|
| **Medical Document AI** | Upload a medical PDF → text extraction → AI classification → structured extraction → summary → missing-information flags |
| **AI Case Manager** | Paste an assistance request → AI extracts patient, location, issue, urgency → one click creates a real case |
| **Claims Automation** | Upload claim documents → classification → extraction → completeness check → human review actions (approve / request info / escalate) |
| **Provider Search** | Match demo providers on specialty, language, availability and distance, with "why this provider" reasoning and real slot booking |
| **Internal AI Assistant** | Lightweight RAG over an operational knowledge base + live case/provider lookups, with sources; a floating panel on every page with voice mode (Grok Voice: asks out loud, opens records on screen) and per-operator conversation history |
| **Voice Agents** | Ten speech-to-speech agents (xAI Grok Voice 3.0), each runnable in the browser in any of 14 languages: appointment booking (**books a real appointment**), the 24/7 hotline, the hospital & provider line, and every outbound agent with the presenter playing the other side |
| **AI Call Center** | Phone agents on Twilio: a 24/7 hotline (emergency triage with **warm transfer to a doctor**, coverage and delay payouts from the policy, bookings, "where is my case?", and hospitals asking about guarantees) and outbound calls (hospital coordination, reminders, follow-ups, missing-document chasers, guarantee receipt checks, **bill negotiation** with hold-harmless, **medical transport assessment** with a cost comparison), with a live call board |
| **Live interpreter** | A case manager (English, browser) and a foreign hospital (phone) talk through real-time AI interpretation both ways, with bilingual captions |
| **E-mail & fax automation** | Inbound claims and hospital mail/faxes: OCR for scans and handwriting, translation, explainable case matching, claim filing, "where is my case?" answered from the records in the traveller's language (9 languages, offline), hospitals' guarantee enquiries answered with the letter attached, risky messages held for review |
| **Letters of Guarantee** | Hospital cost estimate → rules-based decision against the policy → letter PDF → approved automatically or by an operator → faxed back → receipt confirmed |
| **Command palette** | ⌘K / Ctrl K anywhere: find any case, traveller, claim, call, message, guarantee, transport plan or document by name or reference; jump to a module, start a voice agent, receive a sample message |

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
npm run dev:gateway             # voice gateway on :8080 (needs XAI_API_KEY for live voice)
```

Everything except voice and phone runs offline. Voice needs `XAI_API_KEY`;
phone calls also need Twilio and a public HTTPS URL (see
[DEPLOYMENT.md](DEPLOYMENT.md) §2b).

## Quick start (production stack, locally)

```bash
cp .env.example .env            # set a real POSTGRES_PASSWORD
docker compose up -d --build    # nginx → app + voice gateway → postgres (+ backups)
curl http://localhost/api/health
```

Migrations run automatically on container start; set `AUTO_SEED=true` (default)
to seed demo data.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run dev:gateway` | Voice gateway (WebSocket server) in watch mode |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm test` | Unit + integration tests (needs the dev database) |
| `npm run test:e2e` | End-to-end tests against a running app (`E2E_BASE_URL` overridable) |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / seed demo data |
| `npm run demo:samples` | Regenerate the whole sample library: documents, fax scans, `.eml` e-mails, assistance requests (macOS, for the handwriting font) |
| `npm run demo:pdfs` | Regenerate only the text PDFs (what CI runs) |
| `npm run auth:hash -- <name> <password>` | Print an `OPERATOR_USERS` entry |
| `npm run voice:probe -- --agent <id> --say "…"` | Replay a scripted call (macOS voices, any language) through a real voice agent against the live model and the local database; prints the transcript, tools and outcome |

## Sample files

Every screen that reads documents has a **Sample files to download** panel next
to its upload: realistic, fictional hospital documents (letterheads, itemised
invoices, stamps and signatures), fax scans with no text layer, `.eml` e-mails
with their attachments, and assistance requests as text. Download one and feed
it back in through the normal upload, the Inbox's **Import .eml or fax PDF**,
or the case manager's **Load from file**; each kit is also a `.zip`. The people,
policies and cases match the seed, so each file lands on the right record. The
definitions live in `scripts/samples/` and `src/lib/samples/`.

## AI configuration

The platform runs offline by default using a deterministic demo AI provider,
so demos never depend on network or API quotas. To use the live Claude API
(document extraction, OCR, translation, summaries), set `AI_API_KEY` — the
deterministic provider remains as an automatic fallback on any failure. Voice
agents use xAI Grok Voice 3.0 (`XAI_API_KEY`). See
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
