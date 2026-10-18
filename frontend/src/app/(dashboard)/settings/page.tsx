import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { OrganizationCard, OutletsCard, PosKeyCard } from "@/components/settings/settings-forms";
import { requireViewer } from "@/lib/outlets";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const viewer = await requireViewer();
  if (viewer.role !== "OWNER" || !viewer.organizationId) redirect("/dashboard");
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: viewer.organizationId },
    include: { outlets: { orderBy: { name: "asc" }, include: { _count: { select: { dishes: true, users: true } } } } },
  });
  const posKey = process.env.POS_API_KEY ?? "";
  const masked = posKey ? `${"•".repeat(Math.max(0, posKey.length - 4))}${posKey.slice(-4)}` : "";

  return (
    <>
      <PageHeader title="Settings" description="Organisation details, outlets and integrations.">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/settings/audit" />}>
          <ScrollText data-icon="inline-start" /> Activity log
        </Button>
      </PageHeader>
      <OrganizationCard name={org.name} plan={org.plan} />
      <OutletsCard
        outlets={org.outlets.map((o) => ({ id: o.id, name: o.name, city: o.city, latitude: o.latitude, longitude: o.longitude, timezone: o.timezone, dishes: o._count.dishes, users: o._count.users }))}
      />
      <PosKeyCard maskedKey={masked} configured={Boolean(posKey)} />
    </>
  );
}
