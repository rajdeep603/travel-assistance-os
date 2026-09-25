# Testing

Three suites, all run with [Vitest](https://vitest.dev).

| Suite | Location | Needs | Command |
|---|---|---|---|
| Unit | `tests/unit/` | nothing (pure logic) | `npm run test:unit` |
| Integration | `tests/integration/` | dev PostgreSQL, seeded | `npm run test:integration` |
| End-to-end | `tests/e2e/` | a **running app** | `npm run test:e2e` |

`npm test` runs unit + integration (what CI runs before every deployment —
deployment is blocked if they fail).

## Setup

```bash
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL on :5434
npx prisma migrate deploy
npm run demo:pdfs && npm run db:seed
```

For e2e, also start the app (`npm run dev`, or point at any deployment):

```bash
npm run test:e2e                                  # against http://localhost:3000
E2E_BASE_URL=http://<host> npm run test:e2e       # against a deployment
```

## What is covered

### Unit (`tests/unit/`)
- **nlu.test.ts** — deterministic NLU: districts/cities, symptom→specialty
  mapping with word boundaries, urgency escalation, relative date parsing
  ("tomorrow", weekday names), time expressions, name/phone/email extraction,
  case-reference detection.
- **mock-ai.test.ts** — the demo AI provider: full medical-document
  extraction from labelled text, missing-information detection, the ITIC
  sample assistance request (patient/location/urgency/actions), document
  classification, voice NLU (multi-slot utterances, bare answers, option
  selection, confirmation).
- **claims.test.ts** — claim completeness rules: required documents, policy
  number, optional prescription, failed-document flags.

### Integration (`tests/integration/services.test.ts`)
Runs against the real database and cleans up after itself:
- Provider search: specialty/language/availability/distance scoring,
  language filtering, and **booked-slot exclusion** (books a slot, verifies
  it disappears from search).
- Appointments: double-booking rejection.
- Case intake: request → analysis → real case row.
- Claims: AI review of the seeded `CLM-10245` (finds "policy number
  missing"), reviewer actions with history.
- Assistant: knowledge retrieval, live `CASE-1024` status lookup, unknown
  case handling.
- **Voice agent: the complete booking workflow** — collection → search →
  selection → confirmation → appointment + case + conversation summary +
  human handoff, all verified in the database.

### End-to-end (`tests/e2e/workflows.test.ts`)
Exercises the four spec workflows over HTTP against the running app:
1. **Medical Document**: sample processing and a real multipart PDF upload →
   process → extract → fetch back; rejects non-PDF uploads cleanly.
2. **Case Manager**: request → AI analysis → create case → case visible.
3. **Voice**: request → provider search → select → confirm → appointment →
   case (with human handoff verified).
4. **Claims**: multi-document upload → classification → completeness →
   review action.
Plus health-check, provider-search and assistant API contracts.

## Manual verification checklist

Covered in [DEMO_GUIDE.md](DEMO_GUIDE.md) — every module has been verified
in a real browser (upload, analyse, create case, claim actions, provider
booking incl. slot-clash recovery, assistant Q&A, full voice booking).
