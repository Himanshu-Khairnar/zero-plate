"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

async function requireOwner() {
  const viewer = await requireActor();
  if (viewer.role !== "OWNER" || !viewer.organizationId) throw new GuardError("Only the owner can change settings.");
  return viewer as typeof viewer & { organizationId: string };
}

export async function renameOrganization(name: string) {
  return guarded(async () => {
    const clean = z.string().min(2).max(80).trim().parse(name);
    const viewer = await requireOwner();
    await prisma.organization.update({ where: { id: viewer.organizationId }, data: { name: clean } });
    await audit(viewer, "settings.org.rename", { entity: "Organization", entityId: viewer.organizationId, detail: clean });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
  });
}

const outletSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80).trim(),
  city: z.string().min(1).max(80).trim(),
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  timezone: z.string().min(1).max(64).trim(),
});

export async function upsertOutlet(input: z.input<typeof outletSchema>) {
  return guarded(async () => {
    const data = outletSchema.parse(input);
    const viewer = await requireOwner();
    try {
      Intl.DateTimeFormat(undefined, { timeZone: data.timezone });
    } catch {
      throw new GuardError(`"${data.timezone}" is not a valid IANA timezone (e.g. Asia/Kolkata).`);
    }
    let outlet;
    if (data.id) {
      const existing = await prisma.outlet.findFirst({ where: { id: data.id, organizationId: viewer.organizationId } });
      if (!existing) throw new GuardError("Outlet not found.");
      outlet = await prisma.outlet.update({ where: { id: data.id }, data: { name: data.name, city: data.city, latitude: data.latitude, longitude: data.longitude, timezone: data.timezone } });
    } else {
      outlet = await prisma.outlet.create({ data: { name: data.name, city: data.city, latitude: data.latitude, longitude: data.longitude, timezone: data.timezone, organizationId: viewer.organizationId } });
    }
    await audit(viewer, data.id ? "settings.outlet.update" : "settings.outlet.create", { outletId: outlet.id, entity: "Outlet", entityId: outlet.id, detail: `${outlet.name}, ${outlet.city}` });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { id: outlet.id };
  });
}
