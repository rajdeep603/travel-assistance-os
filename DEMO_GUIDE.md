# ITIC Demo Guide

## The one rule

**Do not start by showing every module.** Start with a question:

> “What is the most manual part of your assistance operation today?”

Then show only what answers their pain. The goal is discovery, not a feature
tour. Every flow ends at the same message: *AI does the repetitive work, your
people make the decisions.*

## Preparation (5 minutes)

1. Open `https://<your-domain>` and sign in (operator login).
2. **Leads → Visitor QR code**: print the table card and put it on the
   booth table (see *Visitors' own phones* below).
3. **Call Center** (`/calls`): the hotline number is shown large — put it on
   the booth screen. Ring it once yourself.
4. Have a second phone ready to play "the on-call doctor" (its number is
   `ON_CALL_DOCTOR_NUMBER`) and one to play "the hospital" (allowlisted in
   `OUTBOUND_ALLOWED_NUMBERS`).
5. `curl https://<your-domain>/api/health` → `"status":"ok"`.

## Visitors' own phones: the QR page

**Leads → Visitor QR code** shows the booth's code big on screen, and prints
it as a table card. A visitor scans it with their camera and lands on `/meet`
on their own phone: what CareTrail does in three lines, then a short form
(name, company, e-mail, what they'd solve first). No sign-in, no demo data.
Their details land in **Leads**, marked *From the QR page*, with what they
picked already in the meeting notes. After the show, open the lead:
**Generate quotation** starts the business case with their details filled
in, and the quotation files onto the same lead; **Write the follow-up**
sends the recap (with the quotation once there is one).

## The viewer's clock, the period, and the numbers to take away

- **Time zone.** The clock pill in the header (next to *Present*) shows the
  city and the time there; tap it to show every date and time on screen in
  the visitor's own zone (London, Singapore, New York…). ⌘K also takes
  "Show times in India". The operation itself still runs on Istanbul time
  (the night shift is 20:00 to 08:00 there), which the overview says when
  another zone is chosen.
- **Period.** The overview's *7 days · 30 days · 90 days* switch sets the
  period every outcome and money figure covers.
- **Summary PDF.** The overview's *Summary PDF* button downloads the same
  figures on one A4 page, for the CFO who asks "can I have that?".
- **Leads → Export CSV** gives every lead as a spreadsheet for the CRM.

## 20-minute meetings: what to show, by who you're meeting

Open the **Voice Agents** page (`/voice`) before they sit down. Pick the
agent and **set the language to theirs** (Spanish, Arabic, Turkish, German,
Italian, French, Portuguese, Russian, Polish, Czech, Swedish, Norwegian,
Hindi, Romanian, Serbian, Danish, Dutch, Greek, Ukrainian, Persian, Urdu,
Albanian, Macedonian, Bulgarian, Croatian, Hungarian, Afrikaans, the Asian
languages or English): the agent greets them in it. Outbound agents run here
too: you play the hospital, the doctor or the traveller being called, on a
ready demo case. Press **⌘K** (Ctrl K) anywhere to jump to a case, a
guarantee (`LOG-0902`), a call or a voice agent.

| Who | Minutes 1–8 | Minutes 8–15 | Close on |
|---|---|---|---|
| **Assistance company** (case platform buyer) | Hotline in their language: *"Where is my case? I'm James Carter, born 2 November 1979."* | Inbox: a cost estimate fax becomes a guarantee (`CASE-1024`), then the Spanish or German "where is my case?" e-mail answered from the records | The case page: every call, e-mail and letter on one timeline |
| **Large group / insurer** (voice pilot on one flow) | Hospital & provider line: *"Has the guarantee for Lena Koch, born 29 July 1964, been issued?"*, then ask it to re-send the letter | Letter of Guarantee receipt check, or the hospital's guarantee e-mail answered with the letter attached | Pick one call flow for a 60-day pilot |
| **Cost containment** (bill review) | Inbox: the overbilled final invoice → bill review finds €4,802.50 | Bill negotiation: push back as the billing office; it holds its line and records the hospital's agreement and that the patient isn't billed the difference | The money card and the overview's savings row |
| **Hospital international desk** | Hospital & provider line from the hospital's side: the guarantee, its amount and a top-up request in one call | Medical transport assessment as the treating doctor; the plan shows what an air ambulance would have cost | "Your desk stops chasing guarantees by phone" |
| **Air ambulance / repatriation** | Medical transport assessment: answer as the doctor (stretcher, oxygen, escort) | The transport card: the least intensive safe option, every option's cost, quote requests sent | First call to quote request, automatically |
| **Tech partner / CTO** | Any agent, then the case timeline and the call's tool steps | ⌘K search, the decision trace on a guarantee, bill review rules | Integration by API and signed webhooks (Developers page) |

Before each meeting: if you'll show the bill negotiation, receive
**Hospital bills the final invoice against a guarantee (overbilled)** first
(the voice page offers it), so there's a reviewed bill to negotiate.

Moments that answer what a veteran asks first:
- **"What stops it saying something wrong?"** Open **How this agent works**
  under the agent picker: what it can do, what it never does, when a person
  takes over. Then **Trust & Integration** in the sidebar for procurement and
  IT: decisions the AI never takes, the audit trail, data and hosting, and how
  it sits beside their systems (pilot and roadmap items are labelled).
- **Alarm centres and night shifts** (the "2am calls"): the overview's
  **While your team slept** panel shows one night shift, 20:00 to 08:00, by
  date: calls the AI closed in six languages, the emergency it put through to
  the doctor, the hospital's top-up request. The arrows step through other
  nights.
- **"Try one of ours."** With the live model on, a visitor's own anonymised
  invoice, report or GOP request (PDF, or a phone photo) goes through
  **Medical Document AI** or **Inbox → Import**; the bundled samples still
  give the rehearsed figures. Afterwards, **Delete document** / **Delete
  message** removes it with everything read from it.

## More meetings: correspondents, hospitals, insurers, transport, networks

The booked meetings include many companies on the *receiving* side of a
guarantee (hospitals, local correspondents, collectors), regional
assistance companies in the Red Sea, North Africa, the Gulf, the Caribbean,
Latin America and the Western Balkans, insurers that outsource assistance,
and air ambulance people. One demo serves them all:

| Who | Minutes 1–8 | Minutes 8–15 | Close on |
|---|---|---|---|
| **Local correspondent / hospital desk** (they receive guarantees and chase payers) | **Receivables**: ageing by payer; open `RCV-0902` and run the **payer-ready check** (VIP suite, minibar, duplicate lab, 4 nights for a 2-night stay) | **Call the payer (AI)** on the 72-day invoice (`RCV-0905`): you play the payer's accounts desk | "Invoices that are clean the first time get paid" |
| **Regional assistance company** (Red Sea, North Africa, Gulf) | Inbox → *Red Sea hospital bills the final invoice and asks for a cash deposit*: bill review against `LOG-0905` | Inbox → *Tunisian clinic sends a French discharge report and invoice in TND*: read, translated, reviewed | The traveller isn't asked for cash; the bill comes back inside the guarantee |
| **Caribbean / Latin America** | Inbox → WhatsApp: *Traveller sends the clinic's bill on WhatsApp (Punta Cana)*: filed on `CASE-1002`, answered on WhatsApp | Inbox → *Brazilian hospital asks in Portuguese about its guarantee*: answered in Portuguese with `LOG-0906`; interface in Spanish or Portuguese (language picker) | Their language, on their channel |
| **Insurer that outsources assistance** | **Claims** → `CLM-10230`: a US hospital's USD 34,655 bill, CPT codes, settled at USD 9,214.67 with the **EOB** | **Partner oversight**: the assistance companies handling its travellers, scored side by side; export the scorecard | One scorecard for every vendor |
| **Air ambulance / medical transport** | `CASE-1008` (Geneva → Dubai): **Receive the operators' quotes**: accredited vs. the cheaper unaccredited one, flagged | **Book** the best value and step the **mission** to handover; for a stretcher seat, the pre-filled **MEDIF** | "Accredited, bed to bed, the crew the doctor asked for" |
| **Network or federation** (independent members, correspondents) | **Provider network**: two duplicates found and merged, with **Undo**; accreditation badges; network rates change bill review (`CASE-1008`'s Geneva invoice) | `CASE-1005` → **Network partners**: the hand-off already accepted with an update; open the **Partner's view** link on a phone | One case, many companies, one timeline |
| **CTO / build-vs-buy** | **Developers**: API v1 *Try it* on `CASE-1024`; add a webhook endpoint and press **Test** | **Trust & Integration**: where data can live by country and law, and the product grid (time to go live, pricing model, security) | A pilot plugs into what they run |

Regional samples (Sample files → *Hospitals around the world*) are in USD,
TND, AED, ALL, CHF and more; the Asia-Pacific set is unchanged. Telemedicine:
tick **Include video consultations** in Provider Search, or ask the booking
agent for a video consultation: the booking carries a join link.

The interface language picker (header; ⌘K "Interface in …" on a phone)
switches the whole interface to Spanish, French, Portuguese or Arabic (right
to left): menus, pages, buttons, forms and messages. Records (names, notes,
documents, letters) stay in the language they were written in, as they would
in a real operation.

## After each meeting

Open the lead (or submit the quotation as one) and fill in **Meeting notes**:
who they are, what hurts, the pilot that fits, the next step. **Write the
follow-up** drafts a recap from those notes; edit it and send it with the
quotation the same evening. For large groups and hospitals, pick a
**60-day pilot** in the quotation: it adds the measures and a four-phase plan.

## If they mention… call volumes, seasonal spikes, emergencies

**Have them call the hotline** (number on screen) while `/calls` is visible.
- The AI answers at once, says it's an AI on a demo line, and asks how it
  can help. The call appears on the **Live calls** board with a running
  transcript and the tools it uses.
- Try: *“Is my flight delay covered?”* — it asks for the policy number and
  date of birth (e.g. `POL-TR-100945`, 2 November 1979), then answers from the
  policy: covered, what it pays for the delay (worked out by the system,
  not the model), the documents needed — and that the claims team decides.
- Try: *“Where is my case?”* with a name and date of birth: it finds the
  case and says where things stand (appointment, guarantee, claim, trip home).
- Hospitals use the same number: *“Marmara Heart Center here, about the
  guarantee for Lena Koch…”* gets the guarantee's status and amount.
- Try: *“My husband has chest pain and can't breathe”* — it says to call 112,
  opens a **critical case**, and **warm-transfers to the doctor's phone**,
  which first hears the AI's summary.
- Line: *“Every call answered in seconds, emergencies to a doctor in one
  step — your people only take the calls that need them.”*

## If they mention… coordinating with foreign hospitals, languages

**Open a hospitalisation case** (e.g. `CASE-1024`).
- **AI phone calls → Hospital coordination** → *Call now*: the
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
- Optionally: **AI phone calls → Letter of Guarantee receipt check** to
  confirm the hospital got it.
- **Hospital asks whether the guarantee was issued** (Inbox sample) → an
  automatic reply with the status, the amount and the letter attached, but
  only to the hospital the letter was issued to.
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
- **Internal AI Assistant** (the round button bottom right, on every page,
  or `/assistant`) — procedures with sources, live case status; follow-ups
  ("who is it assigned to?") stay on the case. Press the microphone for
  **voice mode**: ask out loud, it carries on from what was typed, and
  "open it" puts the case on screen while you keep talking. Every
  conversation, typed and spoken, is kept under *History*.
- **Voice Agents** (`/voice`) — every agent in the browser, in any of 14
  languages: pick it, *Start*, talk (or type); what it records appears
  below the stage and on the case.

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
| An agent repeats itself or talks over a caller | Check `docker compose logs voice-gateway`; locally, `npm run voice:probe` replays a call against the live model |
| Data looks messy after experiments | On the server: `docker compose exec app node seed.cjs` restores the canonical demo records (locally: `npm run db:seed`) |
