# Testing

Suites run with [Vitest](https://vitest.dev); files run one at a time
(`fileParallelism: false`) because the integration files share one database
and its call-capacity limits.

| Suite | Location | Needs | Command |
|---|---|---|---|
| Unit | `tests/unit/` | nothing (pure logic) | `npm run test:unit` |
| Integration | `tests/integration/` | PostgreSQL, migrated + seeded | `npm run test:integration` |
| End-to-end (API) | `tests/e2e/` | a **running app** | `npm run test:e2e` |
| Browser (Playwright) | `tests/ui/` | `npm run build`, seeded database | `npm run test:ui` |

`npm test` runs unit + integration — what CI runs before every deployment
(deployment is blocked if they fail). No suite needs an xAI, Anthropic,
Twilio or SendGrid account: external services are replaced by fakes.

## Setup

```bash
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL on :5434
npx prisma migrate deploy
npm run demo:pdfs && npm run db:seed
MOCK_AI_LATENCY_MS=0 npm test
```

Any PostgreSQL works — point `DATABASE_URL` at it (e.g. a local
`taap_test` database) before migrating and seeding.

## Test doubles

| Real service | Double | Used for |
|---|---|---|
| Grok Voice realtime API | `tests/fakes/fake-xai.ts` — a scriptable WebSocket server; tests await client events (`session.update`, `function_call_output`, …) and push server events (audio, transcripts, function calls) | gateway, phone, outbound and interpreter tests |
| Twilio Media Streams | a plain WebSocket client speaking Twilio's `start` / `media` / `mark` / `stop` protocol | phone legs |
| Twilio REST + signatures | `setTelephony(fake)`; webhook requests are signed with Twilio's own `getExpectedTwilioSignature` | inbound/outbound webhooks, transfers, AMD |
| SendGrid / fax provider | `MockEmail` / `MockFax` via `setEmailService` / `setFaxService` | intake replies, Letters of Guarantee |
| Claude | the deterministic demo provider (no `AI_API_KEY`) | everything |

`tests/fakes/run-fake-xai.ts` is a manual-testing harness: a scripted Grok
stand-in for clicking through the voice pages without an xAI key
(`npx tsx tests/fakes/run-fake-xai.ts 8099`, then start the gateway with
`XAI_REALTIME_URL=ws://localhost:8099 XAI_API_KEY=fake`).

## What is covered

### Unit
- **nlu**, **mock-ai**, **claims** — deterministic NLU, the offline AI
  provider, claim completeness rules.
- **time** — Istanbul wall-clock ⇄ UTC conversion under several host
  timezones (UTC, India, US Pacific, Istanbul).
- **auth** — session signing/verification (tampering, expiry), scrypt
  operator credentials.
- **uploads** — content sniffing (PDF/text vs. binary), unique-violation
  detection.
- **guarantee-decision** — Letter of Guarantee rules: limits, excess,
  currency conversion, pre-existing conditions, validity, auto-approval.

### Integration
- **services** — provider search, booking (incl. **five concurrent bookings
  of one slot: exactly one wins**, Istanbul time stored as the right UTC
  instant, off-template times rejected), case intake, claims, assistant.
- **voice-gateway** — a browser voice session end to end: Grok session
  config (model, audio format, VAD, tools), greeting, audio relay, barge-in,
  provider search, booking refused without confirmation, atomic booking +
  case, transcript, summary and case timeline on hang-up.
- **twilio-hotline** — signed inbound webhook → TwiML media stream with a
  signed ticket, retry idempotency, forged signatures rejected; a phone
  emergency: critical case, **warm transfer to the on-call doctor**, the
  whisper summary, call recorded as transferred.
- **outbound-calls** — allowlist, calling hours, call placement with AMD,
  outbound TwiML, a Turkish hospital-coordination session recording a
  structured update, **voicemail on answering-machine detection**, one
  retry for unanswered calls, the signed claimant upload link.
- **interpreter** — two one-way translation sessions with the right formats
  and languages, audio routed to the opposite party, bilingual captions,
  both legs closed out and the case timeline updated.
- **intake** — e-mails: claimant documents filed on the quoted claim with an
  automatic reply; a new claim from e-mailed bills; a Turkish epikriz with
  an English translation; a complaint held for review with a drafted reply;
  the SendGrid webhook's secret path and Message-ID de-duplication. Fax: a
  handwritten scan with no text layer read by OCR and matched to the case.
- **guarantee-letters** — a faxed cost estimate → OCR → rules →
  auto-approved letter PDF (Turkish labels verified in the PDF text) →
  faxed back → receipt confirmed by the voice tool; an over-limit estimate
  held for a human who approves a lower amount.

### Browser (`tests/ui/workflows.spec.ts`, Playwright + Chromium)
Starts the production build (or uses `E2E_BASE_URL`) and clicks through:
the dashboard; request → AI case → *Book a provider* for that case → booking
linked to the case; a faxed cost estimate in the Inbox → OCR → Letter of
Guarantee on `CASE-1024` with its PDF; the Turkish epikriz with its English
translation; the voice page's "not configured" notice. CI runs it after the
build.

### End-to-end (`tests/e2e/workflows.test.ts`)
The spec workflows over HTTP against a running app: documents, case
manager, claims, provider search, assistant, and the voice session start
(ticket issued, or "voice not configured" when there's no xAI key).

## Manual verification

[DEMO_GUIDE.md](DEMO_GUIDE.md) walks every flow. The browser voice page and
Call Center were verified in Chrome against the scripted Grok stand-in
(start → greeting → search → booking → live board → case timeline).
