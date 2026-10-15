"use client";

import { useEffect } from "react";

/**
 * Sends the operator to sign-in when the session has expired, instead of
 * pages showing "could not be loaded": any same-origin API call answered with
 * 401 (other than the sign-in itself) redirects to /login?next=<this page>.
 */
export function SessionWatch() {
  useEffect(() => {
    const original = window.fetch;
    let redirecting = false;
    window.fetch = async (input, init) => {
      const res = await original(input, init);
      if (res.status === 401 && !redirecting) {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        if (url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/")) {
          redirecting = true;
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        }
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return null;
}
