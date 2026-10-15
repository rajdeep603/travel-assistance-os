# Architecture

## Overview

```text
Browsers (operators, booth visitors)      Phones (travellers, hospitals, doctors)
   │ HTTPS / WSS                               │ PSTN
   ▼                                           ▼
nginx (TLS, rate limits) ───────────────► Twilio (voice webhooks, Media Streams, SMS)
   │ /…, /api/*                │ /ws/*                     │ HTTPS webhooks │ WSS μ-law audio
   ▼                           ▼                           ▼                ▼
Next.js app (UI + API)     voice-gateway (WebSocket server, same image)
   │                           │  legs: browser PCM 24 kHz | Twilio μ-law 8 kHz
   │                           │  ⇄ Grok Voice 3.0 (wss://api.x.ai/v1/realtime)
   │                           │  bridge: barge-in, tools, transcripts, monitor
   └───────────┬───────────────┘
               ▼
Service layer (src/lib/services, src/lib/voice, src/lib/intake)
   ├─ AIService: Claude (structured outputs, OCR, translation) + offline provider
   ├─ Voice agents (profiles) + tools → provider search, booking, cases, claims,
   │   coverage, hospital updates, upload links, transfers
   ├─ TelephonyService (Twilio | mock)   EmailService (SendGrid | mock)
   ├─ FaxService (mock; provider adapter later)
   ├─ Intake: OCR → classify/extract → case matching → claims → replies
   ├─ Letters of Guarantee: rules decision → PDF → fax/e-mail → confirmation
   └─ PolicyService, AppointmentService, ClaimsService, Assistant (RAG), …
               ▼
Prisma → PostgreSQL (+ nightly pg_dump backups)

Inbound e-mail: SendGrid Inbound Parse → /api/inbound/email/<secret>
Inbound fax:    provider webhook       → /api/inbound/fax/<secret>
```

## Key design decisions

**External AI is isolated behind `AIService`.** Every module calls the same
interface (`extractMedicalDocument`, `analyzeAssistanceRequest`,
`classifyDocument`, `answerWithContext`, `summarizeClaim`,
`summarizeConversation`, `readDocument` (OCR), `translateText`). The deterministic demo provider
implements the full contract with rule-based NLU, so the demo works with no
network and no API key. With `AI_API_KEY` set, the Anthropic provider is used
with the demo provider as automatic fallback. Live calls use structured
outputs validated against zod schemas (`ai/schemas.ts`), time out after 30 s,
and treat refusals, truncation and schema mismatches as failures — so a slow,
broken or malformed response falls back instead of storing bad data. Results
record which provider produced them (`aiSource`), and the UI labels them
"Claude" or "Offline rules". Swapping vendors means writing one new class.

**Provider availability is a weekly template, expanded at query time.**
Seeded availability never goes stale, and slots already taken (or already in
the past) are excluded from search results. At booking time the slot must be
in the provider's template, and a partial unique index on
`Appointment(providerId, scheduledAt) WHERE status IN (PENDING, CONFIRMED)`
guarantees that of two concurrent bookings exactly one wins; the other gets a
409.

**One operational clock: Istanbul.** Slots, "today/tomorrow" and bookings are
Istanbul wall-clock values; the database stores UTC instants. All conversion
goes through `src/lib/time.ts`, so results never depend on the host timezone
(containers run in UTC).

**RAG stays simple on purpose.** The Internal Assistant builds a TF-IDF
vector index over the seeded `KnowledgeDocument`s per query (8 documents —
indexing cost is negligible) and answers structured questions (case status,
providers by city) directly from the database. Sources are always returned.

**Voice runs in its own gateway process.** Next.js route handlers can't
hold long-lived sockets, so `voice-gateway/` (bundled with esbuild into the
same image, run as a second compose service) carries all live audio. Every
session — browser or phone — is a *leg* joined to a Grok Voice 3.0 session
by `src/lib/voice/bridge.ts`: audio is relayed untouched (each session is
configured with its leg's format: PCM 24 kHz for browsers, G.711 μ-law for
Twilio), caller speech clears agent playback (barge-in), function calls run
the platform's own services through zod-validated tools, and transcripts,
tool activity and outcomes stream to the Call Center and land on the case.
The model is pinned (`XAI_VOICE_MODEL=grok-voice-3.0`) so xAI's `-latest`
auto-migration can't change behaviour mid-event.

**Agents are data.** `src/lib/voice/agents/` defines each agent as a profile:
instructions (xAI's speech-to-speech prompt structure), voice, language hint,
allowed tools, time limit, and — for outbound agents — a brief built from
the case and a suggested number. Inbound: the 24/7 hotline (emergency triage
with warm transfer, coverage, booking, status) and appointment booking.
Outbound: hospital coordination (Turkish), appointment reminder, wellbeing
follow-up, claim missing-documents, Letter of Guarantee receipt check.
Booking requires an explicit `caller_confirmed` and runs in one transaction
with patient and case creation.

**Telephony is guarded.** Twilio webhooks are verified against
`X-Twilio-Signature` (rebuilt from `PUBLIC_BASE_URL` behind nginx); media
streams carry a signed ticket as a `<Parameter>` and must match the CallSid.
Outbound calls only dial `OUTBOUND_ALLOWED_NUMBERS`, are capped by
`MAX_CONCURRENT_CALLS`, use answering-machine
detection (the live agent switches to a voicemail), and are retried once.
Warm transfers announce, dial, and whisper the AI summary to whoever picks
up; an unanswered transfer escalates the case. Real callers' transcripts and
numbers are purged/masked after `CALL_DATA_RETENTION_DAYS`.

**Interpretation is two one-way sessions.** For a call with a foreign
hospital, the gateway joins the case manager's browser leg and the
hospital's phone leg through two Grok sessions (EN→TR and TR→EN, reasoning
off, "translate, never answer" prompt), with live bilingual captions and a
bilingual transcript on the case.

**Inbound e-mail and fax run one intake pipeline** (`src/lib/intake/`):
attachments are read from their text layer or by OCR (Claude reads scans and
handwriting; offline, only the bundled fax samples), classified and
extracted; the message is matched to a case by an explainable score (quoted
CASE/CLM refs, policy number, sender address, patient name + date of birth,
treating hospital); claim documents are filed on the claim (or a new one);
non-English documents keep an English translation. Travellers get an
automatic acknowledgement in their language listing what's still missing —
unless risk flags (complaint/legal, possible emergency, fraud indicators,
low match confidence) send it to a person with a drafted reply.

**Letters of Guarantee are decided by rules, not the model.** A hospital cost
estimate (uploaded, e-mailed or faxed) is checked against the policy: valid
dates, hospitalisation benefit, remaining medical limit, excess, currency
(fixed demo rates), possible pre-existing conditions. Within limits and under
`LOG_AUTO_APPROVE_LIMIT` the letter is approved and faxed back immediately;
otherwise it waits for an operator (who may approve a lower amount). The
PDF embeds Liberation Sans for Turkish labels and carries a DEMO watermark;
every input is kept in `decisionTrace`.

**Errors never leak internals.** All routes are wrapped by
`withErrorHandling`: zod validation errors → 400 with field messages; Prisma
unique violations → 409, bad references → 400, missing records → 404;
connection-level database errors → 503; everything else → 500 with a generic
message. Document-processing failures show a fixed, user-safe message. Stack
traces go to server logs only.

**Operators sign in.** `src/middleware.ts` requires a signed session cookie
(HMAC-SHA256, Web Crypto, 12 h) on every page and API except `/api/health`,
`/login`, `/api/auth/*`, and webhook paths that authenticate themselves
(`/api/twilio/*` by Twilio signature, `/api/inbound/*` by secret path).
Credentials come from `OPERATOR_USERS` (scrypt hashes). Reviewer actions record
the acting operator. Sign-in is off when unconfigured (local development).

## Data model (Prisma)

| Model | Purpose | Key fields |
|---|---|---|
| `Patient` | Fictional travellers | `ref` (PAT-…), policyNumber, language |
| `Case` | Assistance cases | `ref` (CASE-…), status, priority, assistanceType, aiSummary, suggestedActions |
| `Provider` | Demo medical network | `ref` (PRV-…), specialty, district, languages, availability (weekly template), lat/lng |
| `Appointment` | Bookings | `ref` (APT-YYYY-…), scheduledAt, status, source (WEB/VOICE) |
| `Claim` | Claims | `ref` (CLM-…), status, amount, issues (severity+message), history |
| `Document` | Uploaded/demo files | kind, status, storagePath, textContent |
| `DocumentExtraction` | Structured extraction per document | 13 medical fields + summary, missingInfo, confidence |
| `Conversation` | Voice/chat transcripts | messages, dialog state snapshot, summary |
| `KnowledgeDocument` | Assistant knowledge base | slug, title, category, content |
| `Policy` | Travel policy per patient | plan, validity, medical limit/used, benefits (limits, excess, conditions) |
| `Call` | A voice session (phone or browser) | `ref` (CALL-…), direction, channel, agent profile, status, Twilio CallSid, outcome, summary, bridgeId |
| `CaseEvent` | The case timeline | type (CALL, EMAIL, FAX, LETTER_OF_GUARANTEE, NOTE, …), title, body, data, actor |
| `InboundMessage` | Received e-mail / fax | `ref` (MSG-…), status, matched case + confidence + reasons, risk flags, language |
| `OutboundMessage` | The outbox (e-mail, fax, SMS) | status, provider id, automatic vs. approved-by |
| `GuaranteeLetter` | Letter of Guarantee | `ref` (LOG-…), estimate vs. guaranteed amount, excess, flags, status, PDF, decisionTrace |

Human-readable refs (`CASE-1024`, `CLM-10245`, `APT-2026-1024`) come from one
Postgres sequence per ref type (`src/lib/refs.ts`), so concurrent inserts never
race. The seed inserts fixed refs and then re-syncs the sequences; `withRef()`
re-syncs and retries once if a collision still slips through.

## Directory map

```text
src/app/                pages + /api routes (thin: validate → service → respond)
src/lib/services/       business logic (AI, booking, claims, telephony, e-mail, fax, guarantees, …)
src/lib/voice/          voice agents, tools, Grok realtime client, legs, bridge, interpreter
src/lib/intake/         e-mail/fax intake, case matching, language, samples
voice-gateway/          the WebSocket gateway process (bundled into the image)
src/lib/                db client, env, errors, refs, api helpers
src/components/         shared UI primitives (Card, Button, StatusBadge, …) + nav
prisma/                 schema, migrations, seed.ts, seed-data.ts
scripts/                demo PDF generator, deploy.sh
public/demo-documents/  generated fictional medical PDFs
public/demo-inbound/    fictional inbound samples (cost estimate, Turkish epikriz, fax scans)
tests/                  unit / integration / e2e suites, fakes for xAI and Twilio
nginx/                  reverse proxy config for the production stack
```

## Security posture (demo-appropriate)

- Secrets only via environment; `.env` is git-ignored; images contain no secrets
- Operator sign-in on all pages and APIs; nginx rate-limits sign-in, AI and
  telephony routes; HTTPS with HSTS and security headers (`nginx/`)
- zod validation on every mutating route; Prisma parameterises all SQL
- Uploads: PDF/TXT only (checked from file content), 10 MB per file, sanitised
  filenames, stored outside the web root
- Untrusted text (documents, requests, callers) is fenced as data in AI prompts
- No stack traces or sensitive data in responses; server logs avoid document content
- Every page carries a "demo environment — fictional data" banner
