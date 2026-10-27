---
name: caretrail-ui
description: CareTrail's design system: colour tokens, the dark voice stage, voice-state colours, motion rules and the shared UI components (VoiceOrb, Trail, ui.tsx primitives). Use it for any UI, styling, layout or animation change in this repo, from a new page to a button colour.
---

# CareTrail UI

CareTrail is demoed from a presenter laptop at a trade-show booth, so every screen should read clearly from a few metres away. The voice agent is the product's centrepiece. For general design judgement, also load the `frontend-design` skill. This file records the decisions already made for this app.

## Theme

The look follows the reference dashboard the user supplied for ITIC 2026 (`CareTrack AI Dashboard Overview.png`): a light, airy workspace with a white sidebar, white cards on a near-white canvas, pastel icon tiles and bold headings. (2026-10-24.)

- **Light everywhere, dark only where the voice is live.**
  - The sidebar, header, cards, the dashboard hero, the sign-in panel and the visitor's page (`/meet`) are all light.
  - The **stage** (`bg-stage`, deep navy) remains only where an AI voice is live: the voice agent stage on `/voice`, live call cards, the assistant's voice-mode bar, and code samples on `/developers`.
  - Don't add dark mode to other pages ad hoc.
- **The sky.** `.hero-sky` (a morning-blue gradient that deepens toward the end side) plus `.hero-map` (the dotted world map, `public/brand/world-dots.svg`, faded toward the text) are the brand backdrop: dashboard hero, sign-in panel, `/meet`. `.hero-map-top` keeps the map to the top of a panel. Both mirror in Arabic. `public/brand/` is served without sign-in (middleware matcher), so the sign-in page can load it.
- **Colour tokens.**
  - Every colour role is a CSS variable in `src/app/globals.css` (`--c-*`, space-separated RGB), mapped to Tailwind in `tailwind.config.ts`.
  - The roles are `ink`, `muted`, `canvas`, `surface`, `line`, `brand`, `brand-2`, `brand-deep`, `ai`, `live` and `warn`, plus `stage`, `stage-raised`, `stage-line`, `stage-ink` and `stage-muted`.
  - `bg-brand-gradient` (`--g-brand`, brand → a lighter blue) is for primary actions, selected chips and the floating assistant button: always paired with `bg-brand` as the fallback and `shadow-glow`. The active nav item is a flat light-blue pill (`bg-brand/10 text-brand`), as in the reference.
  - Cards: `rounded-2xl border border-line bg-surface shadow-card` (`Card` in `ui.tsx`); `hover:shadow-card-hover` only when the whole card is a link. No gradient washes on pages.
  - **Pastel icon tiles** (`TILE_TONES` in `ui.tsx`: `bg-blue-50 text-blue-600` and so on) carry identity on cards, KPI tiles and list rows; use `StatTile` for a headline figure with an icon. Violet tiles mean AI (the Ask AI card, AI insights, the assistant).
  - Use the tokens in new and touched code. Many pages still use raw `slate-*` and `blue-*`; migrate them when you touch them.
- **Brand.** The name and credits come from `src/lib/brand.ts`. Never hard-code "CareTrail".
  - The official logo is `BrandLogo` in `src/components/brand.tsx`, drawn from `public/brand/caretrail-wordmark.svg` and `caretrail-logo.svg` (the user's artwork, outlines only).
  - The version with "POWERED BY STHIRAM" (`tagline`) is legible only from about 80 px tall. Use it on printed or large surfaces, such as the QR table card. Everywhere else use the wordmark, with "Powered by Sthiram" as real text next to it.
  - `BrandMark` is the square icon alone, for favicons, tight phone headers and the upload page.
  - PDFs use `caretrail-logo.png` (1200 × 233); also put the name in the PDF's text so it can be searched.
  - The navy "CARE" disappears on the dark stage, so don't place the logo there.
- **Type.** Geist only. Page titles and big figures are `font-bold`; card titles `text-lg font-semibold` on the dashboard, `SectionTitle` (16 px) elsewhere. Use `tabular-nums` for timers, refs and table columns, sentence case for labels, and no all-caps eyebrows. Page titles come from `PageHeader` (28 px, 30 px from `md`); don't set a smaller `h1` by hand.

## Header

Sidebar toggle, the wide search field (`SearchButton`, "Search cases, e-mails, claims, or ask AI…", an icon button below `lg`), then language, time zone, Present (hidden on phones), the bell (`AttentionBell`: the overview's "Needs a person" decisions from `/api/overview/attention`, a red dot when anything waits) and the operator's avatar menu (`OperatorMenu`, with sign-out). All controls are 36–40 px tall with `rounded-xl`.

## Voice-state colours

These are used by the orb (`VoiceOrb`), the live call board dots and anything else that shows what an agent is doing.

| State | Colour | Meaning |
|---|---|---|
| idle | `brand` → `brand-2`, dim, slow breath | ready |
| connecting | `warn` + comet ring | starting mic and session |
| listening / hearing | `live` (teal), swells with the mic level | the caller has the floor |
| thinking | `ai` (violet), swirl | the model is working out its answer (`agent_thinking`) |
| speaking | `brand` → `brand-2`, ripples with playback level | the agent is talking |
| tool | `brand-2` + ticking ring | a tool call is running |
| muted | `stage-muted` | mic off |

Violet (`ai`) always means "AI at work", as in `AISourceBadge`. Don't reuse it for anything else.

Money: savings and accepted amounts use `brand`, anything needing a decision or over a limit uses `warn`. Show cents (`formatMoneyExact`) on invoices and reviews, whole euros on overviews. Integrity signals are internal: never show them on traveller-facing surfaces.

## Motion

- `motion` (`motion/react`) is installed. Use it only in client components.
  - `MotionProvider` in the root layout makes every motion animation respect reduced motion.
  - Reach for it for exit animations (`AnimatePresence`), in-place layout changes (`layout`) and shared highlights (`layoutId`, as in the nav).
- Everything else uses CSS keyframes in `globals.css`: `animate-fade-up`, `-pop-in`, `-caret`, `-live-ping`, `-draw` and `-shimmer`.
  - Add each new keyframe to the reduced-motion block at the bottom of that file.
- Durations are 150 ms for presses and hovers, 250 ms for small entrances, and 400 ms for reveals. Use one easing, `ease-smooth` (`cubic-bezier(0.22, 1, 0.36, 1)`), or a spring for celebratory pops.
- **One orchestrated moment per screen.** Motion answers an action (results appearing, a step completing, a booking landing) or shows live state (orb, live dots, caret). Don't add hover lifts to every card or staggered fade-ups to every section.
- **Arrival.** `src/app/(app)/template.tsx` fades and lifts every workspace page in on navigation, and `loading.tsx` beside it shows a skeleton while a server page is built. Pages don't add their own entrance on top; `animate-fade-up` stays for results that appear after an action.
- Canvas and rAF animations read live values from refs. Never push audio levels or other per-frame data through React state.

## Components

| Component | File | Use |
|---|---|---|
| `Card`, `Button`, `PageHeader`, `SectionTitle`, `StatusBadge`, `KeyValue`, `ConfidenceBar`, `Timeline`, `Skeleton*`, `EmptyState`, `ErrorBanner`, `AISourceBadge` | `src/components/ui.tsx` | the shared primitives; reuse them before writing ad-hoc markup |
| `VoiceOrb` | `src/components/voice/voice-orb.tsx` | canvas orb; `state` plus an optional `getLevels` from `useGrokVoice` |
| `VoiceStage`, `StageButton` | `src/components/voice/voice-stage.tsx` | the dark voice stage: orb, status, live caption, booking moment, controls, agent steps |
| `Trail` | `src/components/trail.tsx` | AI steps as stops on a route whose line fills as each step completes (`tone="light"` or `"stage"`) |
| `AIPipeline` + `usePipeline` | `src/components/ai-progress.tsx`, `src/lib/client/use-pipeline.ts` | staged progress for module AI actions; render results only when `pipeline.visible` is false, so the trail finishes first |
| `CountUp` | `src/components/count-up.tsx` | numbers that count to a new value; pass `format` for currency and durations |
| `useWordReveal` | `src/lib/client/use-word-reveal.ts` | writes a finished answer out word by word (capped at 1.2 s) |
| `Elapsed` | `src/components/elapsed.tsx` | ticking m:ss timer |
| `toolSteps` | `src/lib/voice/tool-steps.ts` | collapses the model's parallel duplicate tool calls into one step |
| `BillReviewCard` | `src/components/bill-review-card.tsx` | a bill review: billed vs reference tariff, flagged lines with reasons, accept / pay as billed |
| `MoneyCard` | `src/components/cases/money-card.tsx` | money on a case: estimated → guaranteed → invoiced → after review → paid, plus the policy limit bar |
| `IntegrityCard` | `src/components/integrity-card.tsx` | internal fraud, waste and abuse signals on a claim, with "Refer to the fraud team" |
| `SampleFiles` | `src/components/sample-files.tsx` | the collapsed "Sample files to download" panel beside an upload; kits come from `src/lib/samples/catalog.ts` |
| `QuotationPreview` | `src/components/quotation/quotation-preview.tsx` | the quotation as an A4 page (Sthiram letterhead, services, service charges, terms, return, basis); same wording as the PDF via the shared helpers in `src/lib/business-case.ts` |
| `QuotationWorkspace` | `src/components/quotation/quotation-workspace.tsx` | "Generate quotation": customer and service charges beside the live preview; print, download, submit as a lead, send to the customer (quotation, Teams invite or both in one e-mail) |
| `ProposeCall`, `LeadCalls` | `src/components/leads/propose-call.tsx`, `lead-calls.tsx` | the send panel over the quotation or the lead: quotation and/or Teams invite in one e-mail (one stays ticked), day and time on the customer's clock, free/busy, recipients, the text; also moves a call. The lead's calls with join, Outlook, move, cancel |
| `printElement` | `src/lib/client/print.ts` | prints one element through a hidden frame with the page's styles; use `print:` variants on the element for paper |
| `VisitorQr` | `src/components/leads/visitor-qr.tsx` | the booth's QR code (`/api/leads/qr`), shown big and printable as a table card; visitors land on `/meet` |
| `DashboardHero`, `AskAiCard` | `src/components/dashboard/hero.tsx`, `ask-ai-card.tsx` | the sky hero with the dotted map and a flight drawing itself (the dashboard's one orchestrated moment); the card that opens the assistant |
| `KpiCards`, `ActivityChart`, `StatusDonut` | `src/components/dashboard/` | headline figures with trend and sparkline; stacked daily columns with tooltip and a screen-reader table; cases or claims by status |
| `RecentActivityCard`, `RecentCasesCard`, `InsightsCard` | `src/components/dashboard/recent.tsx` | the bottom row: latest AI work, latest cases, the period's outcome figures |
| `JourneyRoute` | `src/components/dashboard/journey-route.tsx` | the assistance journey as a route on a light card, a live count at each stop; draws once on load (across on desktop, down on phones) |
| `MoneyPanel`, `NeedsPerson` | `src/components/dashboard/` | medical spend (identified vs accepted bar, saving ring, committed guarantees); decisions waiting, each linked to its record |
| `StatTile`, `TILE_TONES` | `src/components/ui.tsx` | a headline figure with a pastel icon tile (receivables, provider network) |
| `AttentionBell`, `OperatorMenu` | `src/components/attention-bell.tsx`, `operator-menu.tsx` | the header's decisions bell and avatar menu |
| `SettlementCard` | `src/components/claims/settlement-card.tsx` | a claim's settlement: billed → never covered → above reference → allowed → excess, plan pays / traveller pays, checks, what needs a person; approving issues the EOB |
| `AirAmbulancePanel`, `TransportPlanForm` | `src/components/cases/` | operators' quotes side by side (accreditation, crew, bed to bed, wheels up; concerns in `warn`), booking, the mission's steps; the doctor's assessment typed in |
| `HandoffCard` | `src/components/cases/handoff-card.tsx` | hand a case to a network partner; their updates and the partner's link |
| `AccreditationBadge` | `src/components/providers/accreditation-badge.tsx` | JCI, ISO 9001, EURAMI… on a provider or an operator's quote |
| `T`, `useT`, `UiLanguageSwitch` | `src/components/i18n.tsx` | the interface language (English, Spanish, French, Portuguese, Arabic); see below |

## Interface language

- Two layers, both keyed by the English text; an untranslated string shows in English, and records stay in the language they were written in.
  - **The shell** (`src/lib/i18n.ts`, hand-written): navigation, header, `PageHeader` titles and introductions, plain-string `SectionTitle`s and the dashboard, rendered through `<T>` (server components) or `useT()` (client). These render translated on the server, with no flash.
  - **Everything else** (`src/lib/i18n-interface/*.json`, generated): `InterfaceTranslator` (mounted in the workspace layout) swaps any text node, `placeholder`, `title`, `aria-label` or `alt` whose text is an interface string (whole, part by part around " · ", or a label before ": ", " (" or " — " with its value kept), in place and only after React has hydrated it. It loads only for a non-English language. Mark an area `translate="no"` (or `data-no-translate`) to keep it as written.
- After adding or changing interface text, run `npm run i18n:translate` (needs `AI_API_KEY`): `scripts/i18n/strings.ts` collects the strings and only new ones are translated. Text built with a template string (`` `${n} cases` ``) can't be matched: split it into JSX text around the value, put the value after a label (`` `Policy number found (${ref})` ``), or use whole sentences per case instead of `` `${label} available` ``. Lib modules whose text is shown as it is are listed in `SCREEN_LIB_FILES` in `scripts/i18n/strings.ts`.
- New page titles, introductions and section titles still go in the hand-written dictionary with `<T>`/`useT()`.
- Arabic sets `dir="rtl"` on `<html>`. Use logical utilities in new code (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`) so things land on the right side; English left in an Arabic page keeps its own word order (`unicode-bidi: plaintext` in `globals.css`).
- On phones the picker is hidden; ⌘K's "Interface in …" commands change it.

## Time on screen

- Every date and time goes through `formatDateTime`, `formatDate`, `formatTime` or `formatDayTime` in `src/lib/format.ts`. They render in the **display time zone** (`src/lib/time-zone.ts`), which the header's clock pill (`TimeZoneSwitch`) and the ⌘K "Show times in …" commands change; the choice lives in the `caretrail-tz` cookie so the server renders in it too. Never call `toLocaleTimeString` or `toLocaleDateString` without a zone: the browser's zone is not the viewer's choice.
- Client components need nothing: changing the zone remounts the page. **Server components** read the cookie themselves (`cookies().get(TIME_ZONE_COOKIE)`, validated with `isTimeZone`) and pass `timeZone` down explicitly, as the dashboard does for `NightShift`.
- The operation's clock (`src/lib/time.ts`, Istanbul: slots, "today", the night shift's 20:00–08:00) is business logic and never follows the display zone.

## The visitor's page (`/meet`)

The one page a visitor opens on their own phone, in the `(visitor)` route group with its own chrome: the sky and dotted map behind the idle orb and the opening lines, three proof points on white cards with pastel tiles, then the form card. Fields are 16 px (`text-base`) so iOS doesn't zoom, chips use the brand gradient when selected, and the consent checkbox uses `accent-brand`. No operator chrome, no demo data, no "fictional" footer: it is a real prospect's first impression. Check it at 390 px wide first, then at iPad and desktop widths.

## Dashboard layout

- Order follows the reference: the hero (title, "Automate. Assist. Accelerate.", the three demo actions, the live pill and the **Ask CareTrail AI** card that opens the assistant), three tinted feature cards (Voice Agents violet, Claims Automation blue, E-mail & Fax green), four KPI cards, the activity chart beside the status donut, then recent AI activity, recent cases and AI insights. Below that: money with "Needs a person", the night shift, the assistance journey and every module.
- **Figures.** KPI cards, the chart and the recent lists come from `src/lib/services/dashboard.ts` (`getActivity`, `getRecentActivity`, `getRecentCases`); the rest from `getOverview`. Series names, colours and the trend arithmetic live in `src/lib/dashboard-series.ts` (no database), so client components can import them. The trend compares with the previous period and, when that was empty, shows what came in lately instead; never invent a percentage.
- **Chart colours** are validated for colour-blind separation in their stack order (cases blue, messages amber, claims purple, calls green); the donut's status colours likewise. Run the dataviz validator before changing them.
- The period (`?days=7|30|90`) is chosen in the chart's select; "Summary PDF" (`/api/overview/pdf`) prints the same figures.
- **Grids** start at `grid-cols-1`, so long truncated text can't widen a phone column. Rows stretch to equal height; grids get a column count the items fill exactly (8 modules in 4 columns).
- Whole cards are links; don't add "Open" buttons inside them. Relative times ("2 hours ago") use `formatTimeAgo` with `localeOf(lang)`, so they come out in the interface language.

## Tablets (iPad)

The ITIC demo also runs on an 11-inch iPad (A16) in Chrome, both ways round. Its viewport is 820 × 1180 CSS px (about 820 × 1066 in portrait and 1180 × 706 in landscape with Chrome's toolbars).

- **Sidebar.** It is docked from `lg` (1024 px, `SIDEBAR_DOCK_QUERY` in `src/lib/sidebar.ts`) and slides in as a drawer below that. The header's `SidebarToggle`, ⌘\ and the command palette hide or show it, and the choice is remembered and applied before paint (`html[data-sidebar="hidden"]`). Use the `sidebar-hidden:` variant for layouts that can use the extra width, as the dashboard's modules do with `lg:sidebar-hidden:grid-cols-4`.
- **No gaps in two-column pages.** When one column is short, either make it sticky (`lg:sticky lg:top-20 lg:self-start`, only if it fits in the landscape height) or let it fill its cell (`h-full`) with useful content. Don't leave a lone empty-state box beside a long column. For an empty result, show the fields the AI will fill, with dashes.
- **Short screens.** Use the `short:` variant (`max-height: 820px`) to tighten vertical spacing; the voice stage uses it, with a smaller orb, to keep its controls above the fold.
- **Full-height pages** use `dvh`, never `vh` or `h-screen`, because iPad toolbars make `100vh` too tall.
- **Floating assistant.** `main` keeps `pb-24` clear for the floating button. Pages without it mark their root `data-fab-free`.
- **Touch.** Hide keyboard-only hints with `[@media(hover:none)]:hidden`.
- **Grids.** Make the last card span the remaining columns, as `lastAgentSpan` does on the Call Center.
- **WebKit.** Chrome on an iPad is WebKit, not Blink, so form controls render differently from desktop Chrome. `globals.css` makes them match: every select gets the same arrow (with room kept for it), and date fields are left-aligned with a calendar icon. Don't restyle these per page.
- **Labels.** Form labels and table headings use sentence case, `text-xs font-medium text-muted`, never `uppercase tracking-wide`.
- **Testing.** Test in Chrome at 820 × 1066 and 1180 × 706, with the sidebar shown and hidden, and in present mode. Present mode steps down to 17 px below 1280 px. Then check the real engine in the iPad (A16) simulator from Xcode: `xcrun simctl openurl` the page, `xcrun simctl io booted screenshot`.
- **Icons.** `src/app/icon.svg` and `icon1.png` (32 px) for tabs, `apple-icon.png` (180 px, full-bleed) for the home screen, and `public/favicon.ico` for clients that ask for it. Next links the first three with hashed URLs, so a changed icon isn't served stale. Keep `favicon.ico` out of `src/app`: there it gets an unhashed link, which browsers cache.

## Things to avoid

The generic AI-generated tells listed in `frontend-design`:
- all-caps tracked labels;
- identical cards with the same shadow everywhere;
- decorative gradient washes;
- `→` appended to every link;
- numbered markers on content that isn't a sequence.

## Before you finish a UI change

- Run `npm run typecheck`, `npm run lint` and `npm run test:unit`.
- Look at the page at 1440 px, at both iPad sizes and at phone width, in present mode (`data-present="on"`), and with macOS "Reduce motion" on.
