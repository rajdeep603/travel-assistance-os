"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, ErrorBanner, readApiError } from "@/components/ui";
import { VoiceOrb } from "@/components/voice/voice-orb";

function LoginForm() {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Sign-in failed. Please try again."));
        return;
      }
      const next = params.get("next");
      // Only same-site relative paths, never an open redirect. A full page
      // load, not router.replace: the client router cache still holds the
      // sign-in redirects it prefetched for every link before the session.
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-describedby={error ? "login-error" : undefined}>
      <div>
        <label htmlFor="op-name" className="mb-1 block text-sm font-medium text-slate-700">
          Operator name
        </label>
        <input
          id="op-name"
          autoComplete="username"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
      <div>
        <label htmlFor="op-password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="op-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
      {error ? (
        <div id="login-error">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      <Button type="submit" busy={busy} className="w-full">
        <Lock size={15} aria-hidden /> Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl bg-surface shadow-xl shadow-slate-900/5 ring-1 ring-line md:grid-cols-[1.1fr_1fr]">
      {/* The agents at rest: the same orb the voice agent uses on a call. */}
      <div className="relative flex flex-col items-center justify-center bg-stage px-8 py-10 text-center text-stage-ink md:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(closest-side, rgb(var(--c-brand) / 0.2), transparent)" }}
        />
        <VoiceOrb state="idle" size={200} className="relative" />
        <p className="relative mt-2 max-w-xs text-xl font-semibold leading-snug tracking-tight">
          Assistance calls answered, doctors booked, cases filed.
        </p>
        <p className="relative mt-2 max-w-xs text-sm text-stage-muted">
          Sign in to watch the AI agents work and step in whenever a person should.
        </p>
      </div>
      <div className="px-7 py-9 md:px-10 md:py-14">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Operator workspace</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
