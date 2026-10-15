import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// ---------------------------------------------------------------------------
// Operator credentials from OPERATOR_USERS, a comma-separated list of
// name:hash pairs, where hash is "scrypt.<salt-hex>.<key-hex>" as printed by
// `npm run auth:hash -- <name> <password>` (no "$", so docker compose .env
// interpolation leaves it alone). Node only (used by the login route).
// ---------------------------------------------------------------------------

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  return `scrypt.${salt.toString("hex")}.${key.toString("hex")}`;
}

export function parseOperatorUsers(raw: string | undefined): Map<string, string> {
  const users = new Map<string, string>();
  for (const entry of (raw ?? "").split(",")) {
    const idx = entry.indexOf(":");
    if (idx <= 0) continue;
    users.set(entry.slice(0, idx).trim().toLowerCase(), entry.slice(idx + 1).trim());
  }
  return users;
}

async function matches(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split(".");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Returns the canonical operator name when the credentials are valid. */
export async function checkCredentials(name: string, password: string): Promise<string | null> {
  const users = parseOperatorUsers(process.env.OPERATOR_USERS);
  const key = name.trim().toLowerCase();
  const stored = users.get(key);
  if (!stored) {
    // Spend comparable time so unknown names aren't distinguishable.
    await scrypt(password, randomBytes(16), KEY_LEN);
    return null;
  }
  return (await matches(password, stored)) ? key : null;
}
