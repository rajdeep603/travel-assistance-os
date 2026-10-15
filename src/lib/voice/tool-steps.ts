// The voice agent's tool calls as steps for people watching: the model can
// fire the same tool twice in parallel, which would read as a stutter, so
// back-to-back calls of one tool are shown as a single step.

export interface ToolCall {
  id: number | string;
  name: string;
  status: "running" | "done" | "error" | string;
  summary?: string;
}

export interface ToolStep {
  /** The first call's id, so a step keeps its identity as calls finish. */
  id: string;
  name: string;
  status: "running" | "done" | "error";
  summary?: string;
}

export function toolSteps(calls: ToolCall[]): ToolStep[] {
  const steps: { step: ToolStep; group: ToolCall[] }[] = [];
  for (const call of calls) {
    const last = steps[steps.length - 1];
    if (last && last.step.name === call.name) last.group.push(call);
    else steps.push({ step: { id: String(call.id), name: call.name, status: "done" }, group: [call] });
  }
  return steps.map(({ step, group }) => {
    // Still running while any copy runs; failed only if every copy failed.
    const status = group.some((c) => c.status === "running")
      ? "running"
      : group.every((c) => c.status === "error")
        ? "error"
        : "done";
    const summary = status === "error" ? group.find((c) => c.summary)?.summary : undefined;
    return { ...step, status, summary };
  });
}
