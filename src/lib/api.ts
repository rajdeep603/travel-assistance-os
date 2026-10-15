import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "./errors";

type Handler<T> = (req: Request, ctx: T) => Promise<Response>;

/** Prisma request errors that are the caller's fault, not an outage. */
const KNOWN_PRISMA_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: "CONFLICT", message: "That record already exists or was just taken." },
  P2003: { status: 400, code: "BAD_REFERENCE", message: "A referenced record does not exist." },
  P2025: { status: 404, code: "NOT_FOUND", message: "The requested record was not found." },
};

/**
 * Wraps a route handler so every error becomes a safe JSON response.
 * Stack traces are logged server-side only and never sent to the client.
 */
export function withErrorHandling<T>(handler: Handler<T>): Handler<T> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message } },
          { status: err.status }
        );
      }
      if (err instanceof ZodError) {
        const message = err.issues
          .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
          .join("; ");
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message } },
          { status: 400 }
        );
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const mapped = KNOWN_PRISMA_ERRORS[err.code];
        if (mapped) {
          console.warn(`[api] ${err.code}:`, err.meta);
          return NextResponse.json(
            { error: { code: mapped.code, message: mapped.message } },
            { status: mapped.status }
          );
        }
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError ||
        err instanceof Prisma.PrismaClientInitializationError ||
        err instanceof Prisma.PrismaClientRustPanicError
      ) {
        console.error("[api] database error:", err);
        return NextResponse.json(
          {
            error: {
              code: "DATABASE_ERROR",
              message:
                "The database is currently unavailable. Please try again shortly.",
            },
          },
          { status: 503 }
        );
      }
      console.error("[api] unexpected error:", err);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Something went wrong on our side. Please try again.",
          },
        },
        { status: 500 }
      );
    }
  };
}

export const json = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data, init);

/** Serializes Prisma rows for JSON responses (Decimal → number, Date → ISO). */
export function serialize<T>(data: T): unknown {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (
        value !== null &&
        typeof value === "object" &&
        typeof (value as { toFixed?: unknown }).toFixed === "function" &&
        (value as { constructor?: { name?: string } }).constructor?.name === "Decimal"
      ) {
        return Number(value);
      }
      return value;
    })
  );
}
