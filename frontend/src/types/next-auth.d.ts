import type { Role } from "@prisma/client"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      organizationId: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role: Role
    organizationId: string | null
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: Role
    organizationId: string | null
  }
}
