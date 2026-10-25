// Client-safe constants for waste tracking (module H).

export const WASTE_REASONS = ["overproduction", "spoilage", "plate_waste", "prep_loss"] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

export const WASTE_REASON_LABEL: Record<WasteReason, string> = {
  overproduction: "Overproduction",
  spoilage: "Spoilage",
  plate_waste: "Plate waste",
  prep_loss: "Prep loss",
};

export const WASTE_REASON_HINT: Record<WasteReason, string> = {
  overproduction: "Cooked more than was sold",
  spoilage: "Went off before it could be used",
  plate_waste: "Left on customers' plates",
  prep_loss: "Lost while peeling, trimming or cooking",
};

/** Rough footprint factors used across analytics: an average plate ≈ 0.35 kg, 2.5 kg CO₂e per kg of food wasted. */
export const KG_PER_PLATE = 0.35;
export const CO2_KG_PER_KG_FOOD = 2.5;

/**
 * Approximate weight of one waste entry: dish rows are plates (× KG_PER_PLATE),
 * ingredient rows use their unit (kg, g, l ≈ kg, ml). Pieces have no known
 * weight and count as 0.
 */
export function wasteKgOf(qty: number, unit: "plates" | string | null | undefined): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  switch ((unit ?? "").toLowerCase()) {
    case "plates":
      return qty * KG_PER_PLATE;
    case "kg":
    case "l":
      return qty;
    case "g":
    case "ml":
      return qty / 1000;
    default:
      return 0;
  }
}
