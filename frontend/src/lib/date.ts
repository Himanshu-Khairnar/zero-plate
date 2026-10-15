export function todayUtcDate(): Date {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

export function todayIsoDate(): string {
  return todayUtcDate().toISOString().slice(0, 10)
}

export function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

export function formatDisplayDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}
