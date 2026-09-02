import { describe, expect, it } from "vitest";

import { ageInMonths, formatWhoPercentile, whoPercentile, whoReferenceValue } from "./who-growth";

describe("WHO girls growth standards", () => {
  it("calculates completed and fractional months from the date of birth", () => {
    expect(ageInMonths("2025-11-15", "2026-08-15T00:00:00Z")).toBeCloseTo(9, 6);
    expect(ageInMonths("2025-11-15", "2026-08-30T00:00:00Z")).toBeGreaterThan(9);
  });

  it("returns the published 9-month median values", () => {
    expect(whoReferenceValue("weight", 9, 0)).toBeCloseTo(8.2254, 4);
    expect(whoReferenceValue("height", 9, 0)).toBeCloseTo(70.1435, 4);
  });

  it("maps the median weight to the 50th percentile", () => {
    expect(whoPercentile("weight", "2025-11-15", "2026-08-15T00:00:00Z", 8.2254)).toBeCloseTo(50, 1);
  });

  it("formats percentile labels for the chart and table", () => {
    expect(formatWhoPercentile(0.5)).toBe("<1%");
    expect(formatWhoPercentile(49.6)).toBe("50%");
    expect(formatWhoPercentile(99.4)).toBe(">99%");
    expect(formatWhoPercentile(null)).toBeNull();
  });
});
