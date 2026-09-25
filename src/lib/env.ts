const DEFAULT_MAX_UPLOAD_MB = 10;

export const env = {
  get databaseUrl(): string {
    return process.env.DATABASE_URL ?? "";
  },
  get aiApiKey(): string {
    return process.env.AI_API_KEY ?? "";
  },
  get aiModel(): string {
    return process.env.AI_MODEL || "claude-haiku-4-5";
  },
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  },
  get uploadDir(): string {
    return process.env.UPLOAD_DIR || "./uploads";
  },
  get maxUploadBytes(): number {
    const mb = Number(process.env.MAX_UPLOAD_MB);
    return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024;
  },
};
