# ITIC Demo Guide

## The one rule

**Do not start by showing every module.** Start with a question:

> “What is the most manual part of your assistance operation today?”

Then show only what answers their pain. The goal is discovery, not a feature
tour. Every flow ends at the same message: *AI does the repetitive work, your
people make the decisions.*

## Preparation (5 minutes)

1. Open `https://<your-domain>` and sign in (operator login).
2. Check the header shows **Demo — fictional data only**.
3. **Call Center** (`/calls`): the hotline number is shown large — put it on
   the booth screen. Ring it once yourself.
4. Have a second phone ready to play "the on-call doctor" (its number is
   `ON_CALL_DOCTOR_NUMBER`) and one to play "the hospital" (allowlisted in
   `OUTBOUND_ALLOWED_NUMBERS`).
5. `curl https://<your-domain>/api/health` → `"status":"ok"`.

## If they mention… call volumes, seasonal spikes, emergencies

**Have them call the hotline** (number on screen) while `/calls` is visible.
- The AI answers at once, says it's an AI on a demo line, and asks how it
  can help. The call appears on the **Live calls** board with a running
  transcript and the tools it uses.
- Try: *“Is my flight delay covered?”* — it asks for the policy number and
  date of birth (e.g. `POL-TR-100944`, 14 March 1987), then answers from the
  policy: covered, the limit, the minimum delay, the documents needed — and
  that the claims team decides.
- Try: *“My husband has chest pain and can't breathe”* — it says to call 112,
  opens a **critical case**, and **warm-transfers to the doctor's phone**,
  which first hears the AI's summary.
- Line: *“Every call answered in seconds, emergencies to a doctor in one
  step — your people only take the calls that need them.”*

## If they mention… coordinating with foreign hospitals, languages

**Open a hospitalisation case** (e.g. `CASE-1024`).
- **AI phone calls → Hospital coordination (Turkish)** → *Call now*: the
  hospital phone rings and the agent asks, in Turkish, about admission,
  ward, doctor, cost estimate and the medical report — the structured
  answer lands on the case timeline in English.
- **Live interpreter call**: talk English in the browser; the hospital
  phone hears Turkish, and its Turkish answers come back in English, with
  captions for both.
- Line: *“No more three-way calls with an interpreter on hold.”*

## If they mention… claims by e-mail, faxes, paperwork

**Show the Inbox** (`/inbox`) → *Try it with a fictional message*:
- **Claimant sends missing policy number + discharge summary** → filed on
  claim `CLM-10245`, re-reviewed, and an automatic reply lists what's
  still missing.
- **Handwritten medical report fax** → no text layer, read by OCR, matched
  to the patient's case.
- **Hospital sends a Turkish discharge summary** → read, extracted, and an
  English translation kept beside the original.
- **Upset traveller threatens legal action** → *not* answered
  automatically: flagged, with a drafted reply for a person to approve.
- Line: *“The inbox works itself; your team handles the exceptions.”*

## If they mention… guarantees of payment

**Inbox → Cost estimate fax (Oliver Bennett)**, then open `CASE-1024`:
- The fax was read, the estimate checked against the policy (Premier, within
  limits), and a **Letter of Guarantee** generated, approved automatically
  and **faxed back** — open the PDF.
- Show the decision trace: estimate, remaining limit, excess, the rule.
- Over the limit or a possible pre-existing condition → it waits for a
  person, who can approve a lower amount.
- Optionally: **AI phone calls → Letter of Guarantee — receipt check** to
  confirm the hospital got it.
- Line: *“The stranded traveller isn't turned away while paperwork waits.”*

## If they mention… documents, case management, claims, providers, knowledge

The original modules, unchanged:
- **Medical Document AI** (`/documents`) — a sample PDF → 13 fields, summary,
  missing information.
- **AI Case Manager** (`/cases`) — *Use sample request* → *Analyse with AI*
  → *Create Case*. From the case: *Book a provider*, *Add a medical
  document*, *Start a claim* — all linked back to the case.
- **Claims Automation** (`/claims`) — `CLM-10245`, completeness, *Request
  Information*.
- **Provider Search** (`/providers`) — *Why this provider?*, book a slot.
- **Internal AI Assistant** (`/assistant`) — procedures with sources,
  live case status.
- **Voice Agent** (`/voice`) — the same agents in the browser: *Start*,
  talk (or type), watch provider options, the booking and the case appear.

## Closing position

> “We're not here to replace your systems. **Give us one manual workflow
> and we'll build an AI-powered pilot around it** — like any of the ones you
> just saw.”

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser says the microphone is blocked | Click the lock icon → allow the microphone; or type — same flow |
| Voice page says voice isn't configured | `XAI_API_KEY` missing in `.env`; `docker compose up -d` after adding it |
| Hotline doesn't answer | Twilio number's voice webhook must be `https://<domain>/api/twilio/voice/inbound`; check `docker compose logs voice-gateway` |
| "isn't on the list of numbers AI agents may call" | Add the number to `OUTBOUND_ALLOWED_NUMBERS` |
| Transfer says nobody can take the call | Set `ON_CALL_DOCTOR_NUMBER` / `CASE_MANAGER_NUMBER` |
| No provider found | Providers take bookings daily until 22:00 (international clinics until 23:30); pick an earlier time or tomorrow |
| Data looks messy after experiments | On the server: `docker compose exec app node seed.cjs` restores the canonical demo records (locally: `npm run db:seed`) |
