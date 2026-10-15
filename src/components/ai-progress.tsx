"use client";

import { Trail } from "@/components/trail";

export { usePipeline } from "@/lib/client/use-pipeline";

// Staged AI-pipeline progress, so the audience sees *what* the AI is doing
// instead of a bare spinner. Drive it with usePipeline(busy, stages.length):
// the stages mirror the real pipeline steps; the walking pace is
// presentational and the finish follows the real response.

export function AIPipeline({ stages, active, tone = "light" }: { stages: string[]; active: number; tone?: "light" | "stage" }) {
  return (
    <Trail
      label="AI pipeline progress"
      tone={tone}
      stops={stages.map((stage, i) => ({
        id: stage,
        label: stage,
        status: i < active ? "done" : i === active ? "running" : "pending",
      }))}
    />
  );
}
