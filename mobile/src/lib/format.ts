/** Local calendar date as YYYY-MM-DD (the server stores dates in this form). */
export function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDay(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Mon 12 Oct" */
export function shortDate(date: string): string {
  const d = parseDay(date);
  if (!d) return date;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "12" (day-of-month), used under trend bars */
export function dayOfMonth(date: string): string {
  const d = parseDay(date);
  return d ? String(d.getDate()) : "";
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}:${mm}`;
}

export function num(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Money in rupees, compact for big numbers. */
export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

/** "plate_waste" -> "Plate waste" */
export function humanize(s: string): string {
  const t = s.replace(/[_-]+/g, " ").toLowerCase().trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
