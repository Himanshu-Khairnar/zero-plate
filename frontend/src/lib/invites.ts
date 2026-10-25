import "server-only"

import { randomBytes } from "node:crypto"

import { prisma } from "@/lib/prisma"

/**
 * Staff invitations, shared by the web invite form (`inviteStaff` action) and
 * the mobile API. Callers check the inviter's role, organisation and input first.
 */

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export type CreateInvitationInput = {
  organizationId: string
  email: string
  role: "MANAGER" | "KITCHEN_STAFF"
  outletId: string
}

export type CreateInvitationResult = { ok: true; inviteUrl: string } | { ok: false; reason: "user_exists" }

/** One invitation link valid for 48 hours, unless a user with that email already exists. */
export async function createInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
  const { organizationId, email, role, outletId } = input

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) return { ok: false, reason: "user_exists" }

  const token = randomBytes(32).toString("hex")

  const invitation = await prisma.invitation.create({
    data: {
      email,
      role,
      token,
      outletId,
      organizationId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  })

  const inviteUrl = `${APP_URL}/accept-invite?token=${invitation.token}`

  console.log(`[invite-staff] Invitation for ${email}: ${inviteUrl}`)

  return { ok: true, inviteUrl }
}
