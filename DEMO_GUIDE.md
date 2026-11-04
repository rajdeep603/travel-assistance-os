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
6. The demo data stays current on its own: `demo-refresh.cjs` runs every
   morning on the server, moving the fictional history forward so "last 7
   days", the activity chart and the night shift show a live operation. By
   hand: `docker compose exec app node demo-refresh.cjs` (a dry run), then
   `--apply`.
7. **Leads → Import meetings (CSV)** with your booked meetings and a brief
   for each (see *Booked meetings and business cards* below), so **Leads**
   opens on the day's meetings in order.
8. Plan B is ready on the laptop and the films are on the iPad (see *Plan B*
   at the end).

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

## Booked meetings and business cards

**Booked meetings.** Keep the meetings you booked for the show in a
spreadsheet, one row each, and save it as CSV with this header row:

```
customerName,companyName,email,phone,role,segment,meetingAt,brief
```

Only `customerName` and `companyName` are needed. `meetingAt` is the time on
the Istanbul clock, as `2026-11-02 14:30` (or an ISO time with its offset,
`2026-11-02T11:30:00Z`). `segment` is one of `assistance`, `insurer`,
`cost-containment`, `hospital`, `air-ambulance`, `partner` (or its label as
the meeting notes show it). `brief` is your preparation: who they are, what to
probe, what to show; line breaks are kept. **Leads → Import meetings (CSV)**
checks every row first: if one is wrong, nothing is imported and each problem
is listed by its row number (the header is row 1), with a template to
download. Importing the list again updates the same leads (matched by e-mail,
or by company and name when there is no e-mail), so fix the spreadsheet and
import it again whenever a meeting moves. Imported meetings are marked
*Booked meeting* and record no consent to e-mail.

At the show, open **Leads**: *Upcoming meetings* lists today's first, in
order, with the next one marked. Each opens the lead on **Before the
meeting**: the time and your brief, editable in place (**Edit**). Any lead can
get one with **Add a meeting brief**.

**Business cards.** **Leads → Scan a business card** opens the iPad's camera
(on the laptop, it picks a photo). The AI reads the card into a short form:
name, company, job title, e-mail, phone, website. Check it against the card,
correct anything, and **Save lead**. If a lead with that e-mail already exists
(they also scanned the QR code, or you imported their meeting), that lead is
updated and opened instead of a second one. The photo isn't kept. A card is
not consent to e-mail: ask before you send anything, and tick it in the send
panel when they agree. Without internet or the AI model, the form opens empty
for you to type the card in.

## The viewer's clock, the period, and the numbers to take away

- **Time zone.** The clock pill in the header (next to *Present*) shows the
  city and the time there; tap it to show every date and time on screen in
  the visitor's own zone (London, Singapore, New York…). ⌘K also takes
  "Show times in India". The operation itself still runs on Istanbul time
  (the night shift is 20:00 to 08:00 there), which the overview says when
  another zone is chosen.
- **Period.** The *Last 7 / 30 / 90 days* select on the overview's activity
  chart sets the period every card, outcome and money figure covers.
- **Ask CareTrail AI.** The card in the overview's hero opens the assistant
  over the page; the bell in the header lists every decision waiting for a
  person, each opening its record.
- **Summary PDF.** The overview's *Summary PDF* button downloads the same
  figures on one A4 page, for the CFO who asks "can I have that?".
- **Leads → Export CSV** gives every lead as a spreadsheet for the CRM.

## 15-minute meetings: the demo runs

Each kind of prospect has a **demo run** on the Voice Agents page (`/voice?run=…`;
also **Start demo run** on a booked meeting's lead page, and "Demo run: …" in
⌘K): three or four agents in the order that tells their story, each on the
demo case that fits it, with the lines you say as the other side and what the
prospect should notice. Every step has a dot: green when its case is ready,
amber when a rehearsal used it up (a letter acknowledged, an appointment
cancelled, a bill agreed) or its dates drifted. **Make all ready** repairs the
pinned cases in one click: press it before each meeting. The picker never
starts an agent on a case that doesn't fit; it offers the ready case instead,
and from a case page only the agents the case fits are offered.

Each step runs either way: **Start conversation** for the browser (you play
the other side), or **Call my phone** under the step's lines. The number is
your own mobile by default (the first approved number; **Add a number** puts
a visitor's in, with its country code), with the language beside it. For an
inbound step the step's agent rings the phone, plays a short tone and stays
quiet: read the first line and it answers, in the language chosen or the one
you speak. If you pick up with a hello, it answers in one line and waits for
your first line. For an outbound step the agent rings the phone and opens the
call along the step's lines, so your answers fit. Either way the agent is
told the names in the step's lines (the hospital, the patient, the reference),
so a "Koch" the line turns into "Coach" still finds LOG-0902, and the
guarantee lookup takes a surname loosely beside the date of birth or the
reference. The call runs between the phone
and the server, so the booth's Wi-Fi only carries the click; it shows live
under the demo run with its transcript and tool steps. Nothing on that screen
is a note to you: the prospect watches it. What to point out is here instead.

**Receive it again.** A bundled e-mail, fax or WhatsApp sample received a
second time replaces its previous copy and everything that copy produced
(its bill review, the claim it opened, the letter drafted from it), so a
seeded case shows one of each however many meetings use it. **Delete
message** in the Inbox does the same for a visitor's own file. Every e-mail
or WhatsApp message without an answer has a reply box; a fax is answered by
the Letter of Guarantee it produces. **Import** takes an optional sender's
fax number, so a visitor's cost estimate finds its hospital.

**A noisy hall.** Phone calls pass through an adaptive noise gate on the
server: the chatter around the phone reaches the agent as silence, so it
never starts a turn, cuts the agent off or makes it ask "sorry?". A voice
held to the phone passes untouched, and while the agent is speaking it takes
a clear voice to interrupt it. Hold the phone close and speak normally;
`VOICE_PHONE_NOISE_GATE=off` disables the gate if ever needed. The browser
session uses the browser's own noise suppression.

**What to point out, per run (not on screen):**

- **Assistance company.** "Where is my case?": set the language to theirs
  first; the hotline finds the case from a name and date of birth and answers
  in it. A traveller needs a doctor: a case is opened and a provider booked
  while they watch; the booking lands on the stage. The reminder call: outbound
  calls run from the records (appointment, address, time). The follow-up call
  is recorded on the case; "worse" hands over to the doctor. Close on the case
  page: every call, e-mail and letter on one timeline.
- **Large group or insurer.** The hospital line: nothing is shared before the
  patient is verified; the letter is found and re-sent on request. Did the
  letter arrive?: Turkish by default; the receipt is confirmed on the case and
  the agent never changes the amount. The claim missing documents: the missing
  items come from the claim's documents, an upload link goes out by text, no
  promise of approval. Flight delay: the payout is worked out from the policy;
  the claims team keeps the final decision. Close on one call flow for a
  60-day pilot.
- **Cost containment.** Negotiation: *Make it ready* receives the hospital's
  final invoice and reviews it (€4,802.50 found); the agent holds its line and
  never names its limit. "Where is my claim?": status and what it still needs,
  from the records, in their language. Chasing a payer: the same platform works
  for the hospital's billing office; disputes go to a person, never a discount.
  Close on the money card on CASE-1022 and the overview's savings row.
- **Hospital international desk.** Your desk calls about a guarantee: the
  guarantee, its amount and a top-up request in one call, any hour. Chasing the
  payer's invoice: status, approved amount and payment date recorded on the
  invoice; what's missing is written down. The assistance company calls your
  admissions desk: Turkish by default, figures repeated back, the update filed
  on the case. The journey home: the doctor's answers decide the transport; the
  plan shows what an air ambulance would have cost. Close on "your desk stops
  chasing guarantees by phone".
- **Air ambulance or repatriation.** The assessment call: stretcher, oxygen
  and escort become a transport plan; quote requests go to the operators.
  Coordinating with the hospital: ward, doctor and cost estimate on the case
  before the mission is planned. After discharge: the patient is called back;
  deterioration hands over to the doctor. Close on the transport card: the
  least intensive safe option, every option's cost, quote requests sent.
- **Technology partner.** The coverage question: every tool call shows on the
  stage as a step; transcript and summary land on the call record. The
  negotiation: the brief, the guardrails and the agreement record are rules the
  agent can't talk its way around. The claim completed by phone: the missing
  list is computed from the documents; the upload link is a signed URL. Close
  on integration by API and signed webhooks (the Developers page).

| Who | Demo run | Steps |
|---|---|---|
| **Assistance company** | `/voice?run=assistance` | "Where is my case?" (their language) → a traveller needs a doctor → the reminder call (`CASE-1016`) → the follow-up call (`CASE-1015`) |
| **Large group / insurer** | `/voice?run=insurer` | a hospital asks about a guarantee → did the letter arrive? (`CASE-1024`) → the claim missing documents (`CASE-1021`) → "Is my flight delay covered?" |
| **Cost containment** | `/voice?run=cost-containment` | negotiate the overbilled invoice (`CASE-1022`; *Make it ready* receives and reviews it) → "Where is my claim?" → chasing a payer (`RCV-0905`) |
| **Hospital international desk** | `/voice?run=hospital` | your desk calls about a guarantee → chasing the payer's invoice (`RCV-0905`) → the assistance company calls your admissions desk (`CASE-1024`) → planning the journey home (`CASE-1022`) |
| **Air ambulance / repatriation** | `/voice?run=air-ambulance` | the assessment call (`CASE-1022`) → coordinating with the hospital (`CASE-1024`) → after discharge (`CASE-1015`) |
| **Tech partner / CTO** | `/voice?run=partner` | a coverage question with its tool steps → a negotiation with a private limit (`CASE-1022`) → a claim completed by phone (`CASE-1021`) |

## The longer version: 20 minutes, by who you're meeting

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
  **Night shift** panel shows one night, 20:00 to 08:00, by date: calls the AI closed in six languages, the emergency it put through to
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
| **Network or federation** (independent members, correspondents) | **Find care** (`/providers`): *Four Seasons Sultanahmet*, Urgent care, **Open now**: 2 km → widened, driving minutes, "why here", who was left out and why; **Validate by phone** on a result: Ada rings the practice (your phone plays the front desk) and the record updates itself; **Price-list link** as a QR code the practice scans | **Provider network**: the health score and cleanup queue, two duplicates found and merged, with **Undo**; accreditation badges; network rates change bill review (`CASE-1008`'s Geneva invoice); `CASE-1005` → **Network partners**: the hand-off accepted with an update | A network that cleans itself while you search it |
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

**At the end of a first meeting, send the invite, not the quotation.** Book
the scoping call while you are still together ("I'll send you an invite now
for Tuesday at 3 pm with your operations head"), ask who else should be on it,
and ask before anything goes: "Is it okay if I send this to your work e-mail?"
Tick that they agreed; it is kept on the lead (visitors who used the QR page
agreed there). The suggested text uses their own words from the QR page, or
the problems in your meeting notes. Talk about the pricing model and a pilot
range if they ask; send the quotation after the scoping call, when it is no
longer a guess.

**Send to customer** (in the quotation's header) sends the quotation, a Teams
call invite, or both, in one e-mail; one of the two stays ticked, and it opens
with the invite alone. With both,
the customer gets a single Outlook invitation from
rajdeep.shah@sthiramservices.com with the quotation PDF attached and its
summary in the text, so accepting, declining or proposing another time reaches
a real inbox. Pick the day and time on *their* clock and add their colleagues;
a warning shows if the time clashes with something in that calendar. The
quotation alone still goes by e-mail from our address, as before. With the
invite, the quotation is submitted as a lead on the way, the call becomes the
lead's next step, and the follow-up e-mail carries the join link. **Teams
calls** on the lead proposes another call (the quotation can be attached),
moves or cancels one; Outlook tells everyone invited. Placeholder addresses
(`example.com`) are refused, as with e-mail.

## Four agents from the ITIC conversations (added 4 Nov)

What assistance companies, brokers, hospital desks and air-ambulance operators
asked for at the booth on 2 and 3 November, now on the Voice Agents page:

- **Coverage check with the insurer** (`outbound-benefit-verification`, group
  "We call insurers", CASE-1024). The hospital's or the assistance desk's call
  that eats hours on hold: policy active, treatment covered, limit and excess,
  guarantee or pre-authorisation and its reference, where to send documents.
  Asked for by Clinic International, Daria's hospital international desks, the
  hospital with the insurance-audit problem, and Sura as a TPA. Point out: it
  never claims cover the desk did not confirm, and the answer lands on the
  case timeline. In the hospital run it replaces the transport step.
- **Field emergency intake (24/7)** (`inbound-emergency-intake`, "Travellers
  call us"). For brokers and adventure assistance (the India/Nepal broker,
  the Dubai call centre): danger first, then the exact location, who, what,
  what help; opens the case, records the intake, hands over to the doctor with
  the intake read out. Try the trek-leader line at 4,200 m; then say "he's
  unconscious" and watch it go straight to the hand-over.
- **Receiving hospital acceptance** (`outbound-bed-acceptance`, "We call
  hospitals", CASE-1022). The other half of the transport story for air
  ambulance operators (Stephen in Nairobi, Estram): the bed, the accepting
  physician, the documents, the hand-over point, the earliest admission. In
  the air-ambulance run it sits between the hospital coordination and the
  follow-up.
- **Missed-call return** (`outbound-missed-call-return`, "We call travellers",
  no case needed). For the hospital that loses half its calls and for any
  desk with a queue: every dropped call is returned within minutes, in the
  caller's language, and handled like the hotline would (coverage, a doctor,
  case status) or booked for a person. Play the traveller with the broken
  tooth.

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
- **Price check** (`CASE-1015`, LOG-0904): before guaranteeing, the
  estimate is checked against the usual range for that treatment in that
  country. The knee arthroscopy is 52% above it, so the letter waits for a
  person to agree the price with the hospital first. (Ranges are fictional
  demo values; theirs come from their own tariff and claims history.)
- **Updates to the family** (`CASE-1024`, right column): Oliver's daughter
  gets WhatsApp updates at each step: case opened, the hospital's news,
  the guarantee. They go out automatically when a guarantee is sent or a
  case closes; demo numbers are simulated, and a number on the outbound
  allowlist (your own phone) gets the real message.
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
- **Find care** (`/providers`) — where the patient is (district, hotel,
  airport or the case's own location) and what they need; 2 km first,
  widening to 5, 10 and 25 km; **Open now**, **Direct billing**, language;
  driving minutes, an estimate, *Why here*, who was left out and why; book a
  slot. **Validate by phone**: Ada rings the practice on CareTrail's behalf
  (pick your own phone and play the front desk) and the record updates
  itself; **Price-list link**: a QR code or a text/e-mail to the practice,
  which confirms its details and sends prices (typed, or a price list the
  AI reads) on a page under the CareTrail logo. Each provider has a page
  (`/providers/PRV-2001`): what we know and who established it, prices,
  validation calls, the change log, "how did the referral go?".
- **Provider network** (`/providers/network`) — the health score, what is
  wrong and how often, the cleanup queue (Validate from the row), duplicates
  merged with Undo, accreditations and network rates.
- **Internal AI Assistant** (the round button bottom right, on every page,
  or `/assistant`) — procedures with sources, live case status; follow-ups
  ("who is it assigned to?") stay on the case. Press the microphone for
  **voice mode**: ask out loud, it carries on from what was typed, and
  "open it" puts the case on screen while you keep talking. Every
  conversation, typed and spoken, is kept under *History*.
- **Voice Agents** (`/voice`) — every agent in the browser, in any of 14
  languages: pick it, *Start*, talk (or type); what it records appears
  below the stage and on the case.

## If they mention… SLAs, audits, KPIs for their insurer clients

- **Service levels** on the overview: calls answered, hospital contacted,
  guarantee sent, appointment booked, each against its target over the
  period (example targets; each client contract sets its own).
- On a case (`CASE-1024`), the same steps with their times: answered in
  1 s, hospital contacted in 1 h 16 min, guarantee 23 s after the estimate.
- Line: *“The report your insurer asks for, live, from the work itself.”*

## The business case and the quotation

- Pick the preset that matches who you're meeting: the page leads with
  **their** number: cost per case for an assistance company or a
  correspondent, medical spend for an insurer, desk hours for a hospital.
- Under it: a **range** (75% of the assumptions to the assumptions as
  entered) and the **busiest month**: the peak covered without temporary
  staff. Talk capacity, not headcount.
- In the quotation, **Bill review, paid from its savings**: a share of the
  verified savings instead of a price per bill. No saving, no fee. Type the
  share you agree; nothing is pre-filled.
- The pilot plan now records a baseline in week one and says the roll-out
  follows on the quotation's terms if the measures are met.

## Closing position

> “We're not here to replace your systems. **Give us one manual workflow
> and we'll build an AI-powered pilot around it** — like any of the ones you
> just saw.”

## Plan B: when the venue Wi-Fi fails

CareTrail also runs on the presenter laptop, with no internet, and the iPad
opens it over a phone's hotspot. The AI then answers on its offline rules,
which give the rehearsed results on the demo's own records and sample files.

**The morning of day one, while you still have internet (5 minutes):**

1. Laptop: Postgres running (`brew services start postgresql@17`), then
   `npm ci` if `node_modules` is missing, then **`npm run demo:offline`**. It
   builds CareTrail, creates a fresh demo database (`caretrail_offline` on
   `localhost:5432`; `OFFLINE_DB=…` picks another name) and starts it on
   port 3000 (`OFFLINE_PORT=…` for another). Sign in with your usual operator
   login.
2. In that local copy, **Leads → Import meetings (CSV)** with your meetings
   file, so the day's meetings and briefs are there offline too. Stop it with
   Ctrl+C.
3. iPad: put the films in the **Files** app under *On My iPad*, not iCloud
   Drive, which streams: the explainer (`CareTrail-explainer-1080p.mp4`, and
   the music-only cut for a silent loop) and the 60-second cuts. Play each
   once in airplane mode.
4. Phone: know the hotspot's name and password, and check that the laptop
   and the iPad both join it.

**When the Wi-Fi goes:**

1. Phone: **Personal Hotspot** on. Laptop and iPad join it.
2. Laptop: **`npm run demo:offline -- --keep-data --no-build`**. It starts in
   seconds, with the data from the morning (`--keep-data` keeps the database,
   `--no-build` reuses the build). It prints the address for the iPad, such as
   `http://172.20.10.3:3000`. If macOS asks whether `node` may accept
   incoming connections, allow it.
3. iPad (Chrome): open that address and sign in. Sign-in works over plain
   http on the hotspot. On the laptop itself, `http://localhost:3000`.
4. If the phone has no signal either, the hotspot may stop as well: carry on
   with the laptop alone, and play the films from the iPad.

**What works offline:** the dashboard and its figures, cases, the inbox, the
demo's sample documents and their extractions, claims, bill review and
settlement, guarantees of payment, provider search and booking, the internal
assistant (answers from the knowledge base, on the offline rules), the
business case and quotation (print and PDF), Leads with the booked meetings,
their briefs and the Before the meeting card, the interface languages and the
time zones.

**What needs the internet:** live voice agents and the hotline (Grok and
Twilio: show past calls and their transcripts in the Call Center instead), AI reading of
new documents, photos and business cards (the card form opens empty: type it
in), translation beyond the built-in glossaries, sending e-mail, Teams
invites, WhatsApp, and the visitor QR page (visitors' phones aren't on your
hotspot).

**Afterwards:** what you entered offline stays in the laptop's database.
**Leads → Export CSV** there, then add those leads on the live site. Running
`npm run demo:offline` without `--keep-data` starts again from a fresh
database.

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
