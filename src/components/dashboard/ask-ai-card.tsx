"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { OPEN_ASSISTANT_EVENT, type OpenAssistantDetail } from "@/components/assistant/assistant-provider";
import { T } from "@/components/i18n";
import { BRAND } from "@/lib/brand";

/** The hero's way into the internal assistant: opens its panel over the page. */
export function AskAiCard() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail: {} }))}
      className="group flex w-full items-center gap-4 rounded-2xl border border-white bg-white/95 p-4 text-start shadow-[0_14px_34px_-14px_rgb(var(--c-brand)/0.45)] backdrop-blur transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-14px_rgb(var(--c-brand)/0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
        <Sparkles size={22} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-ink">
          <T>{`Ask ${BRAND.name} AI`}</T>
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">
          <T>Cases, claims and procedures, typed or out loud</T>
        </span>
      </span>
      <ArrowRight size={20} className="shrink-0 text-ink transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
    </button>
  );
}
