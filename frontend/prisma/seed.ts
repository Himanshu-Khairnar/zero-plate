import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const DEMO_PASSWORD = "Password123!"

const ORG_ID = "org_spice_garden"
const BANDRA_OUTLET_ID = "outlet_bandra"
const ANDHERI_OUTLET_ID = "outlet_andheri"

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const organization = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: "Spice Garden Group", plan: "PRO" },
    create: { id: ORG_ID, name: "Spice Garden Group", plan: "PRO" },
  })

  const bandra = await prisma.outlet.upsert({
    where: { id: BANDRA_OUTLET_ID },
    update: {
      name: "Bandra Branch",
      city: "Mumbai",
      organizationId: organization.id,
    },
    create: {
      id: BANDRA_OUTLET_ID,
      name: "Bandra Branch",
      city: "Mumbai",
      organizationId: organization.id,
    },
  })

  await prisma.outlet.upsert({
    where: { id: ANDHERI_OUTLET_ID },
    update: {
      name: "Andheri Central",
      city: "Mumbai",
      organizationId: organization.id,
    },
    create: {
      id: ANDHERI_OUTLET_ID,
      name: "Andheri Central",
      city: "Mumbai",
      organizationId: organization.id,
    },
  })

  const owner = await prisma.user.upsert({
    where: { email: "owner@wasteless.local" },
    update: {
      name: "Priya Menon",
      passwordHash,
      role: "OWNER",
      organizationId: organization.id,
    },
    create: {
      name: "Priya Menon",
      email: "owner@wasteless.local",
      passwordHash,
      role: "OWNER",
      organizationId: organization.id,
    },
  })

  const manager = await prisma.user.upsert({
    where: { email: "manager@wasteless.local" },
    update: {
      name: "Rahul Sharma",
      passwordHash,
      role: "MANAGER",
      organizationId: organization.id,
    },
    create: {
      name: "Rahul Sharma",
      email: "manager@wasteless.local",
      passwordHash,
      role: "MANAGER",
      organizationId: organization.id,
    },
  })

  const kitchen = await prisma.user.upsert({
    where: { email: "kitchen@wasteless.local" },
    update: {
      name: "Anita Desai",
      passwordHash,
      role: "KITCHEN_STAFF",
      organizationId: organization.id,
    },
    create: {
      name: "Anita Desai",
      email: "kitchen@wasteless.local",
      passwordHash,
      role: "KITCHEN_STAFF",
      organizationId: organization.id,
    },
  })

  const admin = await prisma.user.upsert({
    where: { email: "admin@wasteless.local" },
    update: {
      name: "Platform Admin",
      passwordHash,
      role: "PLATFORM_ADMIN",
      organizationId: null,
    },
    create: {
      name: "Platform Admin",
      email: "admin@wasteless.local",
      passwordHash,
      role: "PLATFORM_ADMIN",
      organizationId: null,
    },
  })

  await prisma.userOutlet.upsert({
    where: {
      userId_outletId: { userId: kitchen.id, outletId: bandra.id },
    },
    update: {},
    create: { userId: kitchen.id, outletId: bandra.id },
  })

  console.log("Seed complete.")
  console.log(`  Organization: ${organization.name} (${organization.plan})`)
  console.log(`  Outlets: Bandra Branch, Andheri Central`)
  console.log(
    `  Users: ${[owner.email, manager.email, kitchen.email, admin.email].join(", ")}`,
  )
  console.log(`  Password for all users: ${DEMO_PASSWORD}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
