"use client";

import { useEffect, useState } from "react";

/**
 * Reads a URL query parameter after mount. Avoids useSearchParams so client
 * pages don't need a Suspense boundary just to read a prefill hint.
 */
export function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return value;
}
