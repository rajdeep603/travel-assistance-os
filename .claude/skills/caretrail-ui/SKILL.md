---
name: caretrail-ui
description: CareTrail's design system: colour tokens, the dark voice stage, voice-state colours, motion rules and the shared UI components (VoiceOrb, Trail, ui.tsx primitives). Use it for any UI, styling, layout or animation change in this repo, from a new page to a button colour.
---

# CareTrail UI

CareTrail is demoed from a presenter laptop at a trade-show booth, so every screen should read clearly from a few metres away. The voice agent is the product's centrepiece. For general design judgement, also load the `frontend-design` skill. This file records the decisions already made for this app.

## Theme

- **Light workspace, dark stage.**
  - The operator workspace is light (`bg-canvas`, cards on `bg-surface`) because it stays readable under bright hall lighting.
  - The **stage** (`bg-stage`, deep navy) is used only where the AI is live: the sidebar, the voice agent stage, live call cards and the sign-in panel.
  - Don't add dark mode to other pages ad hoc.
- **Colour tokens.**
  - Every colour role is a CSS variable in `src/app/globals.css` (`--c-*`, space-separated RGB), mapped to Tailwind in `tailwind.config.ts`.
  - The roles are `ink`, `muted`, `canvas`, `surface`, `line`, `brand`, `brand-2`, `brand-deep`, `ai`, `live` and `warn`, plus `stage`, `stage-raised`, `stage-line`, `stage-ink` and `stage-muted`.
  - Use the tokens in new and touched code. Many pages still use raw `slate-*` and `blue-*`; migrate them when you touch them.
  - The company palette will replace the values in `globals.css` only.
- **Brand.** The name and credits come from `src/lib/brand.ts`, and the mark from `src/components/brand.tsx`. Never hard-code "CareTrail".
- **Type.** Geist only. Use `tabular-nums` for KPIs, timers and refs, sentence case for labels, and no all-caps eyebrows.

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

## Motion

- `motion` (`motion/react`) is installed. Use it only in client components.
  - `MotionProvider` in the root layout makes every motion animation respect reduced motion.
  - Reach for it for exit animations (`AnimatePresence`), in-place layout changes (`layout`) and shared highlights (`layoutId`, as in the nav).
- Everything else uses CSS keyframes in `globals.css`: `animate-fade-up`, `-pop-in`, `-caret`, `-live-ping`, `-draw` and `-shimmer`.
  - Add each new keyframe to the reduced-motion block at the bottom of that file.
- Durations are 150 ms for presses and hovers, 250 ms for small entrances, and 400 ms for reveals. Use one easing, `ease-smooth` (`cubic-bezier(0.22, 1, 0.36, 1)`), or a spring for celebratory pops.
- **One orchestrated moment per screen.** Motion answers an action (results appearing, a step completing, a booking landing) or shows live state (orb, live dots, caret). Don't add hover lifts to every card or staggered fade-ups to every section.
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
| `SampleFiles` | `src/components/sample-files.tsx` | the collapsed "Sample files to download" panel beside an upload; kits come from `src/lib/samples/catalog.ts` |

## Things to avoid

The generic AI-generated tells listed in `frontend-design`:
- all-caps tracked labels;
- identical cards with the same shadow everywhere;
- decorative gradient washes;
- `→` appended to every link;
- numbered markers on content that isn't a sequence.

## Before you finish a UI change

- Run `npm run typecheck`, `npm run lint` and `npm run test:unit`.
- Look at the page at 1440 px and at phone width, in present mode (`data-present="on"`), and with macOS "Reduce motion" on.
