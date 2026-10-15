"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button, Card, ErrorBanner, readApiError } from "@/components/ui";

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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
    <div className="mx-auto max-w-sm">
      <Card className="p-7">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Operator workspace</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </Card>
    </div>
  );
}
