import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

// Prisma talks to Postgres through node-postgres (driver adapter). This uses
// unnamed prepared statements, which works with Neon, PgBouncer-style poolers
// and the local PGlite dev server alike.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient() {
  // PGlite (local dev) serves every connection from one session, so keep the
  // pool at 1 there; raise DB_POOL_MAX for Neon/Postgres in production.
  const max = Number(process.env.DB_POOL_MAX ?? 1) || 1
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
