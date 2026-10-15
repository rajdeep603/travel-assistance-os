"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { normalizeLevel, smoothLevel } from "@/lib/voice/client/levels";

// ---------------------------------------------------------------------------
// The voice agent's room-visible presence: a fluid gradient orb on a canvas.
// It breathes when idle, swells with the caller's real mic level while
// listening, swirls violet while thinking, ripples with the agent's real
// playback level while speaking, and ticks a ring while a tool runs. Levels
// are read every frame through `getLevels`, so React never re-renders for
// audio. Colours come from the CSS tokens in globals.css.
// ---------------------------------------------------------------------------

export type OrbState = "idle" | "connecting" | "listening" | "hearing" | "thinking" | "speaking" | "tool" | "muted";

export type LevelReader = () => { mic: number; agent: number };

type RGB = [number, number, number];

interface Look {
  /** Token names (globals.css --c-*) for the two gradient stops. */
  colors: [string, string];
  /** Resting wobble, as a fraction of the radius. */
  amp: number;
  /** How fast the surface moves. */
  speed: number;
  /** How fast the gradient turns (radians per second). */
  swirl: number;
  /** Which audio level drives the orb, and how strongly. */
  source: "mic" | "agent" | null;
  gain: number;
}

const LOOKS: Record<OrbState, Look> = {
  idle: { colors: ["brand", "brand-2"], amp: 0.02, speed: 0.35, swirl: 0.15, source: null, gain: 0 },
  connecting: { colors: ["warn", "brand-2"], amp: 0.03, speed: 0.8, swirl: 0.6, source: null, gain: 0 },
  listening: { colors: ["live", "brand-2"], amp: 0.025, speed: 0.6, swirl: 0.25, source: "mic", gain: 0.11 },
  hearing: { colors: ["live", "brand-2"], amp: 0.035, speed: 0.9, swirl: 0.35, source: "mic", gain: 0.12 },
  thinking: { colors: ["ai", "brand"], amp: 0.045, speed: 1.5, swirl: 1.4, source: null, gain: 0 },
  speaking: { colors: ["brand", "brand-2"], amp: 0.03, speed: 1.1, swirl: 0.5, source: "agent", gain: 0.12 },
  tool: { colors: ["brand-2", "ai"], amp: 0.035, speed: 1.0, swirl: 0.9, source: null, gain: 0 },
  muted: { colors: ["stage-muted", "stage-line"], amp: 0.012, speed: 0.25, swirl: 0.1, source: null, gain: 0 },
};

const FALLBACK: RGB = [37, 99, 235];
const SEGMENTS = 12;
const POINTS = 96;

function readToken(name: string): RGB {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim();
  const parts = raw.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? (parts as RGB) : FALLBACK;
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixRgb = (a: RGB, b: RGB, k: number): RGB => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

interface Anim {
  clock: number;
  phase: number;
  rot: number;
  level: number;
  amp: number;
  speed: number;
  swirl: number;
  gain: number;
  ring: number;
  comet: number;
  c1: RGB;
  c2: RGB;
}

function draw(ctx: CanvasRenderingContext2D, size: number, a: Anim, ringColor: RGB) {
  const c = size / 2;
  const breath = 1 + 0.022 * Math.sin(a.clock * 1.3);
  const R = size * 0.3 * breath * (1 + a.level * 0.1);
  const wobble = a.amp + a.level * a.gain;

  ctx.clearRect(0, 0, size, size);

  // Soft glow behind everything; brighter with sound.
  const glow = ctx.createRadialGradient(c, c, R * 0.55, c, c, R * 1.6);
  glow.addColorStop(0, rgba(a.c2, 0.32 + a.level * 0.3));
  glow.addColorStop(1, rgba(a.c2, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const blob = (radius: number, amp: number, offset: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < POINTS; i++) {
      const th = (i / POINTS) * Math.PI * 2;
      const w =
        Math.sin(3 * th + a.phase + offset) * 0.5 +
        Math.sin(5 * th - a.phase * 1.3 + 1.7 + offset) * 0.3 +
        Math.sin(2 * th + a.phase * 0.7 + 0.5 - offset) * 0.4;
      const r = radius * (1 + amp * w);
      pts.push([c + Math.cos(th) * r, c + Math.sin(th) * r]);
    }
    // A smooth closed curve through the midpoints.
    ctx.beginPath();
    const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
    const start = mid(pts[POINTS - 1], pts[0]);
    ctx.moveTo(start[0], start[1]);
    for (let i = 0; i < POINTS; i++) {
      const p = pts[i];
      const m = mid(p, pts[(i + 1) % POINTS]);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    ctx.closePath();
  };

  // A looser translucent layer gives the surface depth.
  blob(R * 1.06, wobble * 1.4, 2.1);
  ctx.fillStyle = rgba(a.c2, 0.28);
  ctx.fill();

  // The body: a turning two-colour gradient.
  blob(R, wobble, 0);
  const dx = Math.cos(a.rot) * R;
  const dy = Math.sin(a.rot) * R;
  const body = ctx.createLinearGradient(c - dx, c - dy, c + dx, c + dy);
  body.addColorStop(0, rgba(a.c1, 1));
  body.addColorStop(1, rgba(a.c2, 1));
  ctx.fillStyle = body;
  ctx.fill();

  // Light from the top left and shade at the bottom right, inside the body.
  ctx.save();
  ctx.clip();
  const light = ctx.createRadialGradient(c - R * 0.38, c - R * 0.42, 0, c - R * 0.38, c - R * 0.42, R * 1.1);
  light.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  light.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);
  const shade = ctx.createRadialGradient(c + R * 0.45, c + R * 0.55, 0, c + R * 0.45, c + R * 0.55, R * 0.9);
  shade.addColorStop(0, "rgba(2, 6, 23, 0.28)");
  shade.addColorStop(1, "rgba(2, 6, 23, 0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // Tool running: a ring of segments with one ticking round.
  const ringR = R * 1.34;
  if (a.ring > 0.01) {
    const span = ((Math.PI * 2) / SEGMENTS) * 0.55;
    const head = Math.floor(a.clock * 7) % SEGMENTS;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < SEGMENTS; i++) {
      const start = (i / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
      const behind = (head - i + SEGMENTS) % SEGMENTS;
      const lit = behind === 0 ? 1 : behind === 1 ? 0.55 : behind === 2 ? 0.25 : 0;
      ctx.strokeStyle = lit > 0 ? rgba(a.c1, (0.35 + lit * 0.65) * a.ring) : rgba(ringColor, 0.16 * a.ring);
      ctx.beginPath();
      ctx.arc(c, c, ringR, start, start + span);
      ctx.stroke();
    }
  }

  // Connecting: a comet circling the orb.
  if (a.comet > 0.01) {
    const head = a.clock * 3.2;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = rgba(a.c1, a.comet * (1 - i / 8) * 0.9);
      ctx.beginPath();
      ctx.arc(c, c, ringR, head - (i + 1) * 0.12, head - i * 0.12);
      ctx.stroke();
    }
  }
}

export function VoiceOrb({
  state,
  getLevels,
  size = 260,
  className = "",
}: {
  state: OrbState;
  getLevels?: LevelReader;
  size?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelsRef = useRef(getLevels);
  const reduceMotion = useReducedMotion();
  stateRef.current = state;
  levelsRef.current = getLevels;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const palette = new Map<string, RGB>();
    const color = (name: string) => {
      let rgb = palette.get(name);
      if (!rgb) palette.set(name, (rgb = readToken(name)));
      return rgb;
    };
    const ringColor = color("stage-ink");
    const look0 = LOOKS[stateRef.current];
    const a: Anim = {
      clock: 0,
      phase: 0,
      rot: 0,
      level: 0,
      amp: look0.amp,
      speed: look0.speed,
      swirl: look0.swirl,
      gain: look0.gain,
      ring: 0,
      comet: 0,
      c1: color(look0.colors[0]),
      c2: color(look0.colors[1]),
    };

    // Reduced motion: a still orb that only changes colour with the state.
    if (reduceMotion) {
      const look = LOOKS[state];
      draw(ctx, size, { ...a, amp: 0, c1: color(look.colors[0]), c2: color(look.colors[1]) }, ringColor);
      return;
    }

    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(canvas);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;

      const look = LOOKS[stateRef.current];
      const levels = look.source ? levelsRef.current?.() : undefined;
      const raw = look.source === "mic" ? levels?.mic ?? 0 : look.source === "agent" ? levels?.agent ?? 0 : 0;
      a.level = smoothLevel(a.level, normalizeLevel(raw), dt);

      // Ease every property toward the current state's look.
      const k = 1 - Math.exp(-dt / 0.35);
      a.amp = mix(a.amp, look.amp, k);
      a.speed = mix(a.speed, look.speed, k);
      a.swirl = mix(a.swirl, look.swirl, k);
      a.gain = mix(a.gain, look.gain, k);
      a.c1 = mixRgb(a.c1, color(look.colors[0]), k);
      a.c2 = mixRgb(a.c2, color(look.colors[1]), k);
      a.ring = mix(a.ring, stateRef.current === "tool" ? 1 : 0, k);
      a.comet = mix(a.comet, stateRef.current === "connecting" ? 1 : 0, k);

      a.clock += dt;
      a.phase += dt * a.speed * (1 + a.level * 1.5);
      a.rot += dt * a.swirl;
      draw(ctx, size, a, ringColor);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // The loop reads the state through a ref; only a reduced-motion orb redraws per state.
  }, [size, reduceMotion, reduceMotion ? state : null]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ width: size, height: size }} />;
}
