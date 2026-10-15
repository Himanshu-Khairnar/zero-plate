"use server"

import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { z } from "zod"

import { auth, signIn } from "@/auth"
import { prisma } from "@/lib/prisma"

const INVITE_TTL_MS = 48 * 60 * 60 * 1000

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

const inviteStaffSchema = z.object({
  email: z.email().trim(),
  role: z.enum(["MANAGER", "KITCHEN_STAFF"]),
  outletId: z.string().min(1),
})

export type InviteStaffState =
  | {
      error?: string
      fieldErrors?: Partial<Record<"email" | "role" | "outletId", string>>
      inviteUrl?: string
    }
  | undefined

export async function inviteStaff(
  _prevState: InviteStaffState,
  formData: FormData,
): Promise<InviteStaffState> {
  const session = await auth()
  if (!session?.user) {
    return { error: "You must be signed in to invite staff." }
  }

  if (session.user.role !== "OWNER" && session.user.role !== "MANAGER") {
    return { error: "Only owners and managers can invite staff." }
  }

  if (!session.user.organizationId) {
    return { error: "Your account is not linked to an organization." }
  }

  const parsed = inviteStaffSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    outletId: formData.get("outletId"),
  })

  if (!parsed.success) {
    const fieldErrors: Partial<
      Record<"email" | "role" | "outletId", string>
    > = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as "email" | "role" | "outletId"] = issue.message
      }
    }
    return { fieldErrors }
  }

  const { email, role, outletId } = parsed.data

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return { fieldErrors: { email: "A user with this email already exists." } }
  }

  const token = randomBytes(32).toString("hex")

  const invitation = await prisma.invitation.create({
    data: {
      email,
      role,
      token,
      outletId,
      organizationId: session.user.organizationId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  })

  const inviteUrl = `${APP_URL}/accept-invite?token=${invitation.token}`

  console.log(`[invite-staff] Invitation for ${email}: ${inviteUrl}`)

  return { inviteUrl }
}

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).trim(),
  password: z.string().min(8).trim(),
})

export type AcceptInviteState =
  | {
      error?: string
      fieldErrors?: Partial<Record<"name" | "password", string>>
    }
  | undefined

export async function acceptInvite(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    const fieldErrors: Partial<Record<"name" | "password", string>> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === "name" || field === "password") {
        fieldErrors[field] ??= issue.message
      }
    }
    return { fieldErrors }
  }

  const { token, name, password } = parsed.data

  const invitation = await prisma.invitation.findUnique({ where: { token } })
  if (!invitation) {
    return { error: "This invitation link is invalid." }
  }
  if (invitation.acceptedAt) {
    return { error: "This invitation has already been accepted." }
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    return { error: "This invitation has expired. Please request a new one." }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  })
  if (existingUser) {
    return { error: "An account with this email already exists." }
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email: invitation.email,
        passwordHash,
        role: invitation.role,
        organizationId: invitation.organizationId,
      },
    })

    if (invitation.outletId) {
      await tx.userOutlet.create({
        data: { userId: user.id, outletId: invitation.outletId },
      })
    }

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })
  })

  try {
    await signIn("credentials", {
      email: invitation.email,
      password,
      redirectTo: "/dashboard",
    })
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login")
    }
    throw error
  }
}
