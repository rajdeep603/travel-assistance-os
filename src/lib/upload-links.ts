import { gatewaySecret, signToken, verifyToken } from "./auth/tokens";
import { env } from "./env";

// Signed, expiring links that let a traveller add documents to one claim
// without an account (sent by SMS/e-mail from the claims agents).

const TTL_SECONDS = 7 * 24 * 60 * 60;

export type UploadTicket = { kind: "claim-upload"; claimId: string };

export async function claimUploadUrl(claimId: string): Promise<string> {
  const token = await signToken({ kind: "claim-upload", claimId }, gatewaySecret(), TTL_SECONDS);
  const base = env.publicBaseUrl || env.appUrl.replace(/\/$/, "");
  return `${base}/upload/${token}`;
}

export async function verifyUploadToken(token: string): Promise<UploadTicket | null> {
  const t = await verifyToken<UploadTicket>(token, gatewaySecret());
  return t?.kind === "claim-upload" ? t : null;
}
