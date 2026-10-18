import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantChat } from "@/components/assistant/chat";
import { EmptyState, PageHeader } from "@/components/page-header";
import { OutletPicker } from "@/components/url-controls";
import { resolveOutlet } from "@/lib/outlets";

export const metadata = { title: "AI assistant" };

type Search = Promise<{ outlet?: string }>;

export default function AssistantPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Assistant searchParams={searchParams} />
    </Suspense>
  );
}

async function Assistant({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { outlet, outlets } = await resolveOutlet(sp.outlet);
  if (!outlet) return <EmptyState title="No outlet yet" />;
  const mode = process.env.ANTHROPIC_API_KEY ? "claude" : "offline";
  return (
    <>
      <PageHeader title="AI assistant" description="Ask in everyday language. The assistant calls the app's own APIs, so answers come from real data, not guesses.">
        <OutletPicker outlets={outlets} value={outlet.id} />
      </PageHeader>
      <AssistantChat key={outlet.id} outletId={outlet.id} outletName={outlet.name} mode={mode} />
    </>
  );
}
