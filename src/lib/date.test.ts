import { describe, expect, it } from "vitest";
import { ageLabel, shiftDate } from "./date";

describe("date helpers", () => {
  it("calculates the supplied baby age", () => {
    expect(ageLabel("2025-11-15", new Date("2026-09-02T12:00:00+08:00"))).toBe(
      "9 months, 18 days",
    );
  });

  it("moves between calendar days", () => {
    expect(shiftDate("2026-09-02", -1)).toBe("2026-09-01");
  });
});
