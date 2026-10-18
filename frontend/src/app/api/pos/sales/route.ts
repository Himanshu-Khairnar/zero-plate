import { z } from "zod";

import { runImport } from "@/actions/sales";
import { prisma } from "@/lib/prisma";

/**
 * Mock POS integration (module B).
 *
 * POST /api/pos/sales
 * x-pos-key: <POS_API_KEY>
 * { outletId, rows: [{ date, dish, qty, price?, shift? }] }
 *
 * Simulates a real POS pushing the day's sales. Protected by a shared key
 * rather than a user session because a POS is a machine, not a person.
 */

const bodySchema = z.object({
  outletId: z.string().min(1),
  rows: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dish: z.string().min(1),
        qty: z.coerce.number().int().min(0),
        price: z.coerce.number().min(0).optional(),
        shift: z.enum(["lunch", "dinner", "all"]).default("all"),
      }),
    )
    .min(1)
    .max(5000),
});

export async function POST(req: Request) {
  const expected = process.env.POS_API_KEY;
  if (!expected) return Response.json({ error: "POS_API_KEY is not configured on the server." }, { status: 503 });
  if (req.headers.get("x-pos-key") !== expected) return Response.json({ error: "Invalid POS key." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid payload.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  const outlet = await prisma.outlet.findUnique({ where: { id: parsed.data.outletId }, select: { id: true } });
  if (!outlet) return Response.json({ error: "Unknown outletId." }, { status: 404 });

  const summary = await runImport({ ...parsed.data, mode: "replace_days", createMissingDishes: false }, "POS");
  return Response.json({ ok: true, ...summary });
}

export function GET() {
  return Response.json({
    endpoint: "POST /api/pos/sales",
    auth: "x-pos-key header",
    body: { outletId: "string", rows: [{ date: "YYYY-MM-DD", dish: "string", qty: 0, price: 0, shift: "lunch|dinner|all" }] },
  });
}
