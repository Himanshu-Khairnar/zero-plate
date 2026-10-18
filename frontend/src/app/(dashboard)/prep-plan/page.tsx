import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PrepPlanEditor } from "@/components/prep-plan-editor";
import { DatePicker, OutletPicker } from "@/components/url-controls";
import { addDays, isIsoDate, today, tomorrow } from "@/lib/dates";
import { MlServiceError } from "@/lib/ml";
import { resolveOutlet } from "@/lib/outlets";
import { getOrCreatePlan, PlanError } from "@/lib/prep-plans";

export const metadata = { title: "Prep list" };

type Search = Promise<{ outlet?: string; date?: string }>;

export default function PrepPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Prep searchParams={searchParams} />
    </Suspense>
  );
}

async function Prep({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet">Seed the demo data first.</EmptyState>;
  const date = isIsoDate(sp.date) ? sp.date : tomorrow();

  let plan = null;
  let problem: string | null = null;
  try {
    plan = await getOrCreatePlan(outlet.id, date);
  } catch (err) {
    if (err instanceof MlServiceError || err instanceof PlanError) problem = err.message;
    else throw err;
  }

  return (
    <>
      <PageHeader title="Daily prep list" description="The forecast turned into plates and ingredients. Adjust, approve, print for the kitchen.">
        <OutletPicker outlets={outlets} value={outlet.id} />
        <DatePicker value={date} min={addDays(today(), -30)} max={addDays(today(), 13)} />
      </PageHeader>

      {problem ? (
        <Alert variant="destructive">
          <AlertTitle>Could not build the plan for {date}</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : plan ? (
        <PrepPlanEditor key={`${plan.id}-${plan.status}`} plan={plan} outletId={outlet.id} />
      ) : null}
    </>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-16" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
