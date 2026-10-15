import { Mic, MicOff } from "lucide-react";

export type CallVisualState = "idle" | "connecting" | "listening" | "hearing" | "speaking" | "muted";

const RING: Record<CallVisualState, string> = {
  idle: "bg-slate-200 text-slate-500",
  connecting: "bg-amber-400 text-white",
  listening: "bg-emerald-500 text-white",
  hearing: "bg-emerald-600 text-white",
  speaking: "bg-blue-600 text-white",
  muted: "bg-slate-500 text-white",
};

/**
 * The room-visible call indicator: rings while the agent listens (stronger
 * while the caller talks), an equalizer while it speaks.
 */
export function CallVisual({ state }: { state: CallVisualState }) {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center" aria-hidden>
      {state === "listening" || state === "hearing" ? (
        <>
          <span className="animate-mic-ring absolute inset-0 rounded-full bg-emerald-400" />
          {state === "hearing" ? (
            <span className="animate-mic-ring absolute inset-0 rounded-full bg-emerald-400" style={{ animationDelay: "0.4s" }} />
          ) : null}
        </>
      ) : null}
      {state === "connecting" ? <span className="absolute inset-0 animate-pulse rounded-full bg-amber-200 motion-reduce:animate-none" /> : null}
      <span className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full shadow-md transition-colors ${RING[state]}`}>
        {state === "speaking" ? (
          <span className="flex h-6 items-center gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="animate-sound-bar h-full w-[3px] rounded-full bg-white" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </span>
        ) : state === "muted" ? (
          <MicOff size={26} />
        ) : (
          <Mic size={26} />
        )}
      </span>
    </div>
  );
}
