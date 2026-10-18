"use server";

import { revalidatePath } from "next/cache";

import { refreshOperationalAlerts } from "@/lib/alerts";
import { audit, guarded, GuardError, requireOutletActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const ML = process.env.ML_SERVICE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function markAlertRead(outletId: string, alertId: string) {
  return guarded(async () => {
    await requireOutletActor(outletId);
    await prisma.alert.update({ where: { id: alertId, outletId }, data: { isRead: true, readAt: new Date() } });
    revalidatePath("/alerts");
    revalidatePath("/dashboard");
  });
}

export async function markAllRead(outletId: string) {
  return guarded(async () => {
    await requireOutletActor(outletId);
    const res = await prisma.alert.updateMany({ where: { outletId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    revalidatePath("/alerts");
    revalidatePath("/dashboard");
    return { count: res.count };
  });
}

/** Ask the ML service to scan recent sales and write anomaly alerts. */
export async function runAnomalyScan(outletId: string, days = 14) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER", "PLATFORM_ADMIN");
    let res: Response;
    try {
      res = await fetch(`${ML}/api/anomaly/scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outletId, days }),
        cache: "no-store",
      });
    } catch {
      throw new GuardError(`ML service unreachable at ${ML}. Start it with "fastapi dev app/main.py" in backend/.`);
    }
    const body = (await res.json().catch(() => ({}))) as { detail?: string; flagged?: unknown[]; alertsCreated?: number };
    if (!res.ok) throw new GuardError(`ML service: ${body.detail ?? res.statusText}`);
    await audit(viewer, "alerts.anomaly_scan", { outletId, detail: `${body.alertsCreated ?? 0} new, ${body.flagged?.length ?? 0} flagged` });
    revalidatePath("/alerts");
    return { flagged: body.flagged?.length ?? 0, created: body.alertsCreated ?? 0 };
  });
}

export async function refreshAlerts(outletId: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId);
    const created = await refreshOperationalAlerts(outletId);
    await audit(viewer, "alerts.refresh", { outletId, detail: `${created} new` });
    revalidatePath("/alerts");
    revalidatePath("/dashboard");
    return { created };
  });
}
