"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, guarded, GuardError, requireActor } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

const ROLES = ["OWNER", "MANAGER", "KITCHEN_STAFF"] as const;

async function requireOwner() {
  const viewer = await requireActor();
  if (viewer.role !== "OWNER" || !viewer.organizationId) throw new GuardError("Only the owner can manage staff.");
  return viewer as typeof viewer & { organizationId: string };
}

async function orgUser(organizationId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new GuardError("User not found in your organisation.");
  return user;
}

export async function changeUserRole(input: { userId: string; role: (typeof ROLES)[number] }) {
  return guarded(async () => {
    const { userId, role } = z.object({ userId: z.string().min(1), role: z.enum(ROLES) }).parse(input);
    const viewer = await requireOwner();
    if (userId === viewer.id) throw new GuardError("You cannot change your own role.");
    const user = await orgUser(viewer.organizationId, userId);
    await prisma.user.update({ where: { id: userId }, data: { role } });
    await audit(viewer, "staff.role", { entity: "User", entityId: userId, detail: `${user.email}: ${user.role} → ${role}` });
    revalidatePath("/staff");
  });
}

export async function assignUserToOutlet(input: { userId: string; outletId: string }) {
  return guarded(async () => {
    const { userId, outletId } = z.object({ userId: z.string().min(1), outletId: z.string().min(1) }).parse(input);
    const viewer = await requireOwner();
    const user = await orgUser(viewer.organizationId, userId);
    const outlet = await prisma.outlet.findFirst({ where: { id: outletId, organizationId: viewer.organizationId } });
    if (!outlet) throw new GuardError("Outlet not found.");
    await prisma.userOutlet.upsert({ where: { userId_outletId: { userId, outletId } }, update: {}, create: { userId, outletId } });
    await audit(viewer, "staff.assign", { outletId, entity: "User", entityId: userId, detail: `${user.email} → ${outlet.name}` });
    revalidatePath("/staff");
  });
}

export async function unassignUserFromOutlet(input: { userId: string; outletId: string }) {
  return guarded(async () => {
    const { userId, outletId } = z.object({ userId: z.string().min(1), outletId: z.string().min(1) }).parse(input);
    const viewer = await requireOwner();
    const user = await orgUser(viewer.organizationId, userId);
    await prisma.userOutlet.deleteMany({ where: { userId, outletId, outlet: { organizationId: viewer.organizationId } } });
    await audit(viewer, "staff.unassign", { outletId, entity: "User", entityId: userId, detail: user.email });
    revalidatePath("/staff");
  });
}

export async function revokeInvitation(invitationId: string) {
  return guarded(async () => {
    const viewer = await requireActor();
    if (!viewer.organizationId || (viewer.role !== "OWNER" && viewer.role !== "MANAGER")) throw new GuardError("Not allowed.");
    const inv = await prisma.invitation.findFirst({ where: { id: invitationId, organizationId: viewer.organizationId, acceptedAt: null } });
    if (!inv) throw new GuardError("Invitation not found.");
    await prisma.invitation.delete({ where: { id: invitationId } });
    await audit(viewer, "staff.invite.revoke", { entity: "Invitation", entityId: invitationId, detail: inv.email });
    revalidatePath("/staff");
  });
}

export async function removeUser(userId: string) {
  return guarded(async () => {
    const viewer = await requireOwner();
    if (userId === viewer.id) throw new GuardError("You cannot remove yourself.");
    const user = await orgUser(viewer.organizationId, userId);
    await prisma.user.delete({ where: { id: userId } });
    await audit(viewer, "staff.remove", { entity: "User", entityId: userId, detail: `${user.email} (${user.role})` });
    revalidatePath("/staff");
  });
}
