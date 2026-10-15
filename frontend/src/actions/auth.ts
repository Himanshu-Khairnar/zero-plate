"use server"

import bcrypt from "bcryptjs"
import { AuthError } from "next-auth"
import { z } from "zod"

import { signIn, signOut } from "@/auth"
import { prisma } from "@/lib/prisma"

const registerOrganizationSchema = z.object({
  organizationName: z.string().min(2).trim(),
  outletName: z.string().min(2).trim(),
  city: z.string().min(1).trim(),
  name: z.string().min(2).trim(),
  email: z.email().trim(),
  password: z.string().min(8).trim(),
})

export type AuthFields =
  | "organizationName"
  | "outletName"
  | "city"
  | "name"
  | "email"
  | "password"

export type AuthActionState =
  | {
      error?: string
      fieldErrors?: Partial<Record<AuthFields, string>>
      success?: boolean
    }
  | undefined

export async function registerOrganization(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerOrganizationSchema.safeParse({
    organizationName: formData.get("organizationName"),
    outletName: formData.get("outletName"),
    city: formData.get("city"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    const fieldErrors: Partial<Record<AuthFields, string>> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as AuthFields] = issue.message
      }
    }
    return { fieldErrors }
  }

  const { organizationName, outletName, city, name, email, password } =
    parsed.data

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return { fieldErrors: { email: "An account with this email already exists." } }
  }

  const passwordHash = await bcrypt.hash(password, 10)

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName },
    })

    await tx.outlet.create({
      data: {
        name: outletName,
        city,
        organizationId: organization.id,
      },
    })

    await tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "OWNER",
        organizationId: organization.id,
      },
    })
  })

  return { success: true }
}

export async function loginUser(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  try {
    await signIn("credentials", formData)
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." }
    }
    throw error
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" })
}
