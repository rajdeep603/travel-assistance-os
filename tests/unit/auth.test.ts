import { afterEach, describe, expect, it } from "vitest";
import { checkCredentials, hashPassword, parseOperatorUsers } from "@/lib/auth/passwords";
import { readSessionCookie, signSession, verifySession } from "@/lib/auth/session";

const originalUsers = process.env.OPERATOR_USERS;
afterEach(() => {
  process.env.OPERATOR_USERS = originalUsers;
});

describe("operator sessions", () => {
  it("accepts a token signed with the same secret", async () => {
    const token = await signSession("elif", "s3cret");
    expect(await verifySession(token, "s3cret")).toMatchObject({ user: "elif" });
  });

  it("rejects a wrong secret, tampering and expiry", async () => {
    const token = await signSession("elif", "s3cret");
    const [payload, sig] = token.split(".");
    expect(await verifySession(token, "other")).toBeNull();
    expect(await verifySession(`${payload}x.${sig}`, "s3cret")).toBeNull();
    expect(await verifySession(token, "s3cret", Date.now() + 13 * 3600_000)).toBeNull();
    expect(await verifySession(undefined, "s3cret")).toBeNull();
  });

  it("reads the session cookie from a Cookie header", () => {
    expect(readSessionCookie("a=1; taap_session=abc.def; b=2")).toBe("abc.def");
    expect(readSessionCookie(null)).toBeUndefined();
  });
});

describe("operator credentials", () => {
  it("verifies passwords against scrypt hashes from OPERATOR_USERS", async () => {
    process.env.OPERATOR_USERS = `Elif:${await hashPassword("horse-battery")},ops:${await hashPassword("x")}`;
    expect(await checkCredentials("elif", "horse-battery")).toBe("elif");
    expect(await checkCredentials("ELIF", "horse-battery")).toBe("elif");
    expect(await checkCredentials("elif", "wrong")).toBeNull();
    expect(await checkCredentials("nobody", "horse-battery")).toBeNull();
  });

  it("parses name:hash pairs and ignores junk", () => {
    const users = parseOperatorUsers("a:scrypt.1.2, b:scrypt.3.4,broken,:nohash");
    expect([...users.keys()]).toEqual(["a", "b"]);
  });
});
