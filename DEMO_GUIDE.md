# ITIC Demo Guide

## The one rule

**Do not start by showing every module.** Start with a question:

> “What is the most manual part of your assistance operation today?”

Then show only the module that answers their pain. The goal is discovery,
not a feature tour. Every module ends at the same message: *AI does the
repetitive work, your people make the decisions.*

## Preparation (2 minutes)

1. `docker compose up -d` (or `npm run dev`) — open the dashboard.
2. Check the header shows **Demo environment — fictional data only**.
3. Have Chrome for the voice demo (Web Speech API), with mic permission.
4. `curl http://localhost/api/health` → `"status":"ok"`.

## If they mention… documents

**Show Medical Document AI** (`/documents`)
- Click sample `medical-report-aylin-yilmaz.pdf` — processing runs live.
- Point at the right panel: 13 structured fields, AI summary, and — the
  money shot — **Missing information**: “Policy/claim reference missing”.
- Line: *“Your team stops retyping PDFs; they only review what the AI
  flags.”*

## If they mention… case management

**Show AI Case Manager** (`/cases`)
- Click **Use sample request** (the Istanbul stomach-pain email), then
  **Analyse with AI**.
- Walk the panel: patient, location (Taksim), urgency HIGH, suggested
  actions.
- Click **Create Case** — a real case record appears in the list. Open it.
- Line: *“From inbox to actionable case in one click, with the human
  assigned and in control.”*

## If they mention… customer calls

**Show the Voice Medical Assistance Agent** (`/voice`)
- Click **Start call**, then say:
  > “I’m travelling in Istanbul and I need to see a doctor tomorrow.”
- Answer its questions (name, language, phone). Watch the right-hand
  panels fill: patient info → provider options → say “option one” →
  “yes” → **a real appointment reference and case appear**.
- End on the green banner: **AI Completed → Human Case Manager** — open
  the case to show the conversation summary the case manager sees.
- Fallback: if the room is loud, type instead of speaking — same flow.

## If they mention… claims

**Show Claims Automation** (`/claims`)
- Open **CLM-10245** (the seeded hospitalization claim).
- Show the completeness check: invoice ✓, report ✓, discharge ✓, **policy
  number missing ✗** — and the AI summary for the reviewer.
- Click **Request Information** — the status and history update.
- Line: *“The AI prepares the claim; your handler decides in seconds.”*

## If they mention… provider coordination

**Show Provider Search** (`/providers`)
- The form is prefilled with the classic case: Istanbul, General Medicine,
  tomorrow, afternoon, English. Click **Search providers**.
- Show **Why this provider?** — specialty, English-speaking, distance from
  Taksim, availability in the requested window.
- Click a slot → pick a patient → **Confirm booking** → real appointment
  reference.

## If they mention… internal information

**Show the Internal AI Assistant** (`/assistant`)
- Click “What documents are required for a hospitalization case?” — answer
  with sources from the ops knowledge base.
- Then “What is the status of CASE-1024?” — live database lookup.
- Line: *“New staff stop interrupting senior staff — procedures and case
  status in one place.”*

## Closing position

> “We’re not here to replace your systems. **Give us one manual workflow
> and we’ll build an AI-powered pilot around it** — like any one of the
> six you just saw.”

## Troubleshooting

| Symptom | Fix |
|---|---|
| Voice mic blocked | Use the text input — the workflow is identical |
| No provider found | It’s Sunday/evening in the demo data — pick the next weekday or drop the time filter |
| Health check fails | `docker compose ps`, then `docker compose logs app` |
| Data looks messy after experiments | `npm run db:seed` — the seed is idempotent and restores the canonical demo records |
