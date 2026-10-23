import { z } from "zod";
import { json, serialize, withErrorHandling } from "@/lib/api";
import { getOperator } from "@/lib/auth/session";
import { notFound } from "@/lib/errors";
import { chaseByEmail, recordPayment, runPayerReadyCheck, submitReceivable } from "@/lib/services/receivables";

export const dynamic = "force-dynamic";

const paymentSchema = z.object({ amount: z.number().positive() });

/** check: the payer-ready check · submit: send it to the payer · chase: a reminder by e-mail · payment: money received. */
export const POST = withErrorHandling(async (req: Request, { params }: { params: { ref: string; action: string } }) => {
  const operator = (await getOperator(req)) ?? "operator";
  switch (params.action) {
    case "check":
      return json({ receivable: serialize(await runPayerReadyCheck(params.ref)) });
    case "submit":
      return json({ receivable: serialize(await submitReceivable(params.ref, operator)) });
    case "chase":
      return json({ receivable: serialize(await chaseByEmail(params.ref, operator)) });
    case "payment": {
      const body = paymentSchema.parse(await req.json().catch(() => ({})));
      return json({ receivable: serialize(await recordPayment(params.ref, body.amount, operator)) });
    }
    default:
      throw notFound("Action");
  }
});
