import { describe, expect, it } from "vitest";

import { addDays, formatDate, isIsoDate, isoDate, weekdayName } from "./dates";

describe("dates", () => {
  it("formats local calendar days as YYYY-MM-DD", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-18")).toBe(true);
    expect(isIsoDate("18/10/2026")).toBe(false);
    expect(isIsoDate("2026-13-40")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
  it("formats for display without timezone drift", () => {
    expect(weekdayName("2026-10-18")).toBe("Sunday");
    expect(formatDate("2026-10-18", { day: "numeric", month: "short" })).toMatch(/18 Oct/);
  });
});
