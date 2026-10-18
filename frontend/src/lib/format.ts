// Client-safe formatting helpers.

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function inr(n: number): string {
  return inrFmt.format(n);
}

export function num(n: number, digits = 0): string {
  return digits ? n.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : numFmt.format(n);
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

export function signed(n: number, digits = 0): string {
  const s = n.toFixed(digits);
  return n > 0 ? `+${s}` : s;
}

export function qtyWithUnit(qty: number, unit: string): string {
  if (unit === "pcs") return `${Math.ceil(qty)} pcs`;
  if (qty < 1) return `${Math.round(qty * 1000)} ${unit === "kg" ? "g" : unit === "l" ? "ml" : unit}`;
  return `${qty.toFixed(2)} ${unit}`;
}
