# Architecture

## Overview

```text
Browser (React UI, Web Speech API for voice)
   │
   ▼
Next.js 14 (App Router) — one unified application
   ├─ UI pages: /, /documents, /cases, /claims, /providers, /assistant, /voice
   └─ API routes: /api/* (validated with zod, wrapped in safe error handling)
        │
        ▼
Service layer (src/lib/services) — all business logic lives here
   ├─ AIService (provider-agnostic interface)
   │    ├─ MockAIService        deterministic demo provider (default, offline)
   │    ├─ AnthropicAIService   live Claude API (when AI_API_KEY is set)
   │    └─ ResilientAIService   live provider with automatic mock fallback
   ├─ DocumentTextService (pdf.ts)        PDF → text (pdf-parse / pdf.js)
   ├─ DocumentExtractionService           full document pipeline
   ├─ CaseIntakeService                   request analysis → case creation
   ├─ ProviderSearchService               scoring, availability, distance
   ├─ AppointmentService                  slot validation + booking
   ├─ ClaimsService                       completeness, summary, actions
   ├─ Assistant (RAG)                     TF-IDF retrieval + DB lookups
   ├─ VoiceAgentService                   server-side dialog state machine
   └─ NotificationService                 mocked (logs); swappable interface
        │
        ▼
Prisma ORM → PostgreSQL
```

## Key design decisions

**External AI is isolated behind `AIService`.** Every module calls the same
interface (`extractMedicalDocument`, `analyzeAssistanceRequest`,
`classifyDocument`, `answerWithContext`, `interpretVoiceUtterance`,
`summarizeClaim`, `summarizeConversation`). The deterministic demo provider
implements the full contract with rule-based NLU, so the demo works with no
network and no API key. With `AI_API_KEY` set, the Anthropic provider is used
with the demo provider as automatic fallback — an AI outage can never break a
demo. Swapping vendors means writing one new class.

**The voice agent is a server-side state machine.** The browser only does
speech-to-text and text-to-speech (Web Speech API) plus a text fallback; all
understanding, slot collection, provider search, confirmation and booking
happen server-side in `voice-agent.ts` and are persisted per conversation in
the `Conversation` table. Steps: `GREETING → COLLECTING → SEARCHING →
PRESENTING → CONFIRMING → BOOKED → HANDOFF`. Booking happens before case
creation so a taken slot never leaves an orphan case; on a slot clash the
agent re-presents fresh options.

**Provider availability is a weekly template, expanded at query time.**
Seeded availability never goes stale, and slots already taken by appointments
are excluded from search results — so double bookings are rejected both in
search and again at booking time.

**RAG stays simple on purpose.** The Internal Assistant builds a TF-IDF
vector index over the seeded `KnowledgeDocument`s per query (8 documents —
indexing cost is negligible) and answers structured questions (case status,
providers by city) directly from the database. Sources are always returned.

**Errors never leak internals.** All routes are wrapped by
`withErrorHandling`: zod validation errors → 400 with field messages, Prisma
errors → 503 "database unavailable", everything else → 500 with a generic
message. Stack traces go to server logs only.

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

Human-readable refs (`CASE-1024`, `CLM-10245`, `APT-2026-1024`) are generated
from the current maximum suffix (`src/lib/refs.ts`) with uniqueness enforced
by DB constraints.

## Directory map

```text
src/app/                pages + /api routes (thin: validate → service → respond)
src/lib/services/       all business logic (see above)
src/lib/                db client, env, errors, refs, api helpers
src/components/         shared UI primitives (Card, Button, StatusBadge, …) + nav
prisma/                 schema, migrations, seed.ts, seed-data.ts
scripts/                demo PDF generator, deploy.sh
public/demo-documents/  generated fictional medical PDFs
tests/                  unit / integration / e2e suites
nginx/                  reverse proxy config for the production stack
```

## Security posture (demo-appropriate)

- Secrets only via environment; `.env` is git-ignored; images contain no secrets
- zod validation on every mutating route; Prisma parameterises all SQL
- Uploads: PDF/TXT only, 10 MB cap, sanitised filenames, stored outside the web root
- No stack traces or sensitive data in responses; server logs avoid document content
- Every page carries a "demo environment — fictional data" banner
