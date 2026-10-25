"use server";

import { revalidatePath } from "next/cache";

import { markAllAlertsRead, refreshOperationalAlerts, scanAnomalies, setAlertRead } from "@/lib/alerts";
import { audit, guarded, requireOutletActor } from "@/lib/guard";

export async function markAlertRead(outletId: string, alertId: string) {
  return guarded(async () => {
    await requireOutletActor(outletId);
    await setAlertRead(outletId, alertId);
    revalidatePath("/alerts");
    revalidatePath("/dashboard");
  });
}

export async function markAllRead(outletId: string) {
  return guarded(async () => {
    await requireOutletActor(outletId);
    const count = await markAllAlertsRead(outletId);
    revalidatePath("/alerts");
    revalidatePath("/dashboard");
    return { count };
  });
}

/** Ask the ML service to scan recent sales and write anomaly alerts. */
export async function runAnomalyScan(outletId: string, days = 14) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER", "PLATFORM_ADMIN");
    const result = await scanAnomalies(viewer, outletId, days);
    revalidatePath("/alerts");
    return result;
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
