"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireActor, requireOutletActor } from "@/lib/guard";
import { donationSchema, estimateSurplus, recordDonation, setDonationStatus, type DonationStatus, type SurplusEstimate } from "@/lib/donations";
import { prisma } from "@/lib/prisma";

export type { SurplusEstimate, SurplusLine } from "@/lib/donations";

const ngoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80).trim(),
  city: z.string().min(1).max(60).trim(),
  contact: z.string().max(120).trim().optional(),
  address: z.string().max(200).trim().optional(),
  acceptsCooked: z.boolean().default(true),
  pickupNote: z.string().max(200).trim().optional(),
});

/** The NGO directory is shared across tenants; owners and managers may extend it. */
export async function upsertNgo(input: z.input<typeof ngoSchema>) {
  return guarded(async () => {
    const data = ngoSchema.parse(input);
    const viewer = await requireActor();
    if (!["OWNER", "MANAGER", "PLATFORM_ADMIN"].includes(viewer.role)) throw new GuardError("You do not have permission to do that.");
    const payload = { name: data.name, city: data.city, contact: data.contact || null, address: data.address || null, acceptsCooked: data.acceptsCooked, pickupNote: data.pickupNote || null };
    const row = data.id ? await prisma.ngo.update({ where: { id: data.id }, data: payload }) : await prisma.ngo.create({ data: payload });
    await audit(viewer, data.id ? "ngo.update" : "ngo.create", { entity: "Ngo", entityId: row.id, detail: row.name });
    revalidatePath("/donations");
    return { id: row.id };
  });
}

export async function createDonation(input: z.input<typeof donationSchema>) {
  return guarded(async () => {
    const data = donationSchema.parse(input);
    const viewer = await requireOutletActor(data.outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
    const row = await recordDonation(viewer, data);
    revalidatePath("/donations");
    revalidatePath("/dashboard");
    return { id: row.id };
  });
}

export async function updateDonationStatus(outletId: string, id: string, status: DonationStatus) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER", "KITCHEN_STAFF");
    await setDonationStatus(viewer, outletId, id, status);
    revalidatePath("/donations");
    revalidatePath("/dashboard");
  });
}

export async function deleteDonation(outletId: string, id: string) {
  return guarded(async () => {
    const viewer = await requireOutletActor(outletId, "OWNER", "MANAGER");
    const row = await prisma.donation.findFirst({ where: { id, outletId } });
    if (!row) throw new GuardError("Donation not found.");
    await prisma.donation.delete({ where: { id } });
    await audit(viewer, "donation.delete", { outletId, entity: "Donation", entityId: id });
    revalidatePath("/donations");
  });
}

/** Server helper (not an action): see `estimateSurplus` in `@/lib/donations`. */
export async function suggestSurplus(outletId: string, date: string): Promise<SurplusEstimate> {
  return estimateSurplus(outletId, date);
}
