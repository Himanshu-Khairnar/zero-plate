import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, today, tomorrow } from "@/lib/dates";
import { qtyWithUnit } from "@/lib/format";

/**
 * Module K: operational alerts (low stock, expiry, forecast shortage, plan
 * pending). Anomaly alerts come from the ML service's nightly scan.
 *
 * Dedupe rule: at most one *unread* alert per (type, entity). Once the user
 * marks it read, a new one may be raised if the condition persists.
 */

export type AlertType = "anomaly" | "low_stock" | "expiry" | "shortage" | "plan_pending";
export type AlertSeverity = "info" | "warning" | "critical";

type Candidate = {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  entityKey: string; // e.g. ingredient id or plan date
  data?: Record<string, unknown>;
};

const EXPIRY_WINDOW_DAYS = 2;
const PLAN_PENDING_AFTER_HOUR = 10;

async function stockByIngredient(outletId: string) {
  const ingredients = await prisma.ingredient.findMany({
    where: { outletId },
    include: { stockMovements: { select: { type: true, qty: true, expiryDate: true, createdAt: true } } },
  });
  return ingredients.map((i) => {
    const inQty = i.stockMovements.filter((m) => m.type === "IN").reduce((s, m) => s + m.qty, 0);
    const outQty = i.stockMovements.filter((m) => m.type === "OUT").reduce((s, m) => s + m.qty, 0);
    const stock = Math.max(0, inQty - outQty);
    // Oldest-first batches that are still (approximately) in stock.
    let remaining = outQty;
    const batches = i.stockMovements
      .filter((m) => m.type === "IN" && m.expiryDate)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => {
        const consumed = Math.min(remaining, m.qty);
        remaining -= consumed;
        return { expiryDate: m.expiryDate as string, left: m.qty - consumed };
      })
      .filter((b) => b.left > 0.0001);
    return { id: i.id, name: i.name, unit: i.unit, stock, batches, hasMovements: i.stockMovements.length > 0 };
  });
}

/** Ingredient need for one day from stored forecasts (likely) × recipes. */
async function needFor(outletId: string, date: string) {
  const forecasts = await prisma.forecast.findMany({
    where: { outletId, date },
    include: { dish: { include: { recipeItems: true } } },
  });
  const need = new Map<string, number>();
  for (const f of forecasts) {
    for (const r of f.dish.recipeItems) need.set(r.ingredientId, (need.get(r.ingredientId) ?? 0) + f.likely * r.qtyPerPlate);
  }
  return need;
}

export async function collectOperationalAlerts(outletId: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const [stock, needTomorrow, plan] = await Promise.all([
    stockByIngredient(outletId),
    needFor(outletId, tomorrow()),
    prisma.prepPlan.findUnique({ where: { outletId_date: { outletId, date: tomorrow() } }, select: { status: true } }),
  ]);
  const cutoff = addDays(today(), EXPIRY_WINDOW_DAYS);

  for (const ing of stock) {
    if (!ing.hasMovements) continue; // inventory not tracked for this ingredient yet
    const need = needTomorrow.get(ing.id) ?? 0;
    if (need > 0 && ing.stock < need) {
      out.push({
        type: "shortage",
        severity: ing.stock === 0 ? "critical" : "warning",
        message: `${ing.name}: tomorrow's forecast needs ${qtyWithUnit(need, ing.unit)} but only ${qtyWithUnit(ing.stock, ing.unit)} is in stock.`,
        entityKey: ing.id,
        data: { ingredientId: ing.id, need, stock: ing.stock },
      });
    } else if (need > 0 && ing.stock < need * 2) {
      out.push({
        type: "low_stock",
        severity: "info",
        message: `${ing.name} is running low: ${qtyWithUnit(ing.stock, ing.unit)} left, about ${(ing.stock / need).toFixed(1)} days of cover.`,
        entityKey: ing.id,
        data: { ingredientId: ing.id, need, stock: ing.stock },
      });
    }
    const expiring = ing.batches.filter((b) => b.expiryDate <= cutoff);
    if (expiring.length) {
      const qty = expiring.reduce((s, b) => s + b.left, 0);
      const soonest = expiring.map((b) => b.expiryDate).sort()[0];
      out.push({
        type: "expiry",
        severity: soonest < today() ? "critical" : "warning",
        message: soonest < today()
          ? `${ing.name}: ${qtyWithUnit(qty, ing.unit)} expired on ${soonest}. Remove it from stock.`
          : `${ing.name}: ${qtyWithUnit(qty, ing.unit)} expires by ${soonest}. Use it first.`,
        entityKey: ing.id,
        data: { ingredientId: ing.id, qty, expiryDate: soonest },
      });
    }
  }

  const hour = new Date().getHours();
  if ((!plan || plan.status === "DRAFT") && hour >= PLAN_PENDING_AFTER_HOUR) {
    out.push({
      type: "plan_pending",
      severity: "warning",
      message: plan ? `Tomorrow's prep plan is still a draft. Review and approve it before service.` : `Tomorrow's prep plan has not been opened yet.`,
      entityKey: tomorrow(),
      data: { date: tomorrow(), status: plan?.status ?? "MISSING" },
    });
  }
  return out;
}

/** Write new alerts (deduped against open ones) and return how many were created. */
export async function refreshOperationalAlerts(outletId: string): Promise<number> {
  const candidates = await collectOperationalAlerts(outletId);
  const open = await prisma.alert.findMany({ where: { outletId, isRead: false }, select: { type: true, dataJson: true } });
  const openKeys = new Set(open.map((a) => `${a.type}|${entityKeyOf(a.dataJson)}`));
  let created = 0;
  for (const c of candidates) {
    if (openKeys.has(`${c.type}|${c.entityKey}`)) continue;
    const alert = await prisma.alert.create({
      data: { outletId, type: c.type, severity: c.severity, message: c.message, dataJson: JSON.stringify({ ...c.data, entityKey: c.entityKey }) },
    });
    created += 1;
    void notify({ outletId, type: c.type, severity: c.severity, message: c.message, id: alert.id });
  }
  return created;
}

function entityKeyOf(dataJson: string | null): string {
  if (!dataJson) return "";
  try {
    const d = JSON.parse(dataJson) as { entityKey?: string; dishId?: string; date?: string };
    return d.entityKey ?? (d.dishId && d.date ? `${d.dishId}|${d.date}` : "");
  } catch {
    return "";
  }
}

export async function unreadAlertCount(outletId: string | null): Promise<number> {
  if (!outletId) return 0;
  return prisma.alert.count({ where: { outletId, isRead: false } });
}

/**
 * Delivery hook. In-app is always on; email goes through Resend when
 * RESEND_API_KEY and ALERT_EMAIL_TO are configured.
 * TODO (optional per plan): WhatsApp / SMS via Twilio or Gupshup for critical alerts.
 */
export async function notify(alert: { id: string; outletId: string; type: AlertType; severity: AlertSeverity; message: string }) {
  console.info(`[alert:${alert.severity}] ${alert.type} ${alert.outletId}: ${alert.message}`);
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  if (!key || !to || alert.severity === "info") return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM ?? "WasteLess <alerts@wasteless.local>",
        to: [to],
        subject: `[WasteLess] ${alert.severity.toUpperCase()}: ${alert.type.replace("_", " ")}`,
        text: alert.message,
      }),
    });
  } catch (err) {
    console.error("alert email failed", err);
  }
}
