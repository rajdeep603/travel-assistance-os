import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/errors";
import { authEnabled, getOperator } from "./session";

// ---------------------------------------------------------------------------
// Access to the public API (/api/v1): an API key in the Authorization header
// ("Bearer <key>") or X-API-Key, from API_KEYS ("name:key,name:key"); or a
// signed-in operator's session, so the Developers page can try it. Removing a
// key from API_KEYS revokes it.
// ---------------------------------------------------------------------------

export interface ApiCaller {
  via: "key" | "session";
  name: string;
}

function configuredKeys(): { name: string; key: string }[] {
  return (process.env.API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(":");
      return i > 0 ? { name: pair.slice(0, i), key: pair.slice(i + 1) } : { name: "api", key: pair };
    })
    .filter((k) => k.key.length >= 16);
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function requireApiCaller(req: Request): Promise<ApiCaller> {
  const header = req.headers.get("authorization");
  const given = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? req.headers.get("x-api-key")?.trim() ?? null;
  if (given) {
    const hit = configuredKeys().find((k) => same(k.key, given));
    if (hit) return { via: "key", name: hit.name };
    throw new ApiError("That API key isn't valid.", 401, "UNAUTHORIZED");
  }
  const operator = await getOperator(req);
  if (operator) return { via: "session", name: operator };
  if (!authEnabled()) return { via: "session", name: "developer" };
  throw new ApiError("Send an API key: Authorization: Bearer <key>.", 401, "UNAUTHORIZED");
}

/** How many keys are configured (the Developers page says whether keys are set up). */
export const apiKeyCount = () => configuredKeys().length;
