export function DashboardLoading() {
  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside className="hidden w-64 shrink-0 border-r bg-background lg:block">
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <div className="size-9 animate-pulse rounded-xl bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b bg-background px-4">
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
            <div className="size-8 animate-pulse rounded-lg bg-muted" />
          </div>
        </header>
        <main className="flex-1 space-y-6 p-4 sm:p-6">
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </main>
      </div>
    </div>
  )
}
