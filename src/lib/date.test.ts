import { describe, expect, it } from "vitest";
import { ageLabel, formatTime, shiftDate } from "./date";

describe("date helpers", () => {
  it("calculates the supplied baby age", () => {
    expect(ageLabel("2025-11-15", new Date("2026-09-02T12:00:00+08:00"))).toBe(
      "9 months, 18 days",
    );
  });

  it("moves between calendar days", () => {
    expect(shiftDate("2026-09-02", -1)).toBe("2026-09-01");
  });

  it("formats record times with am or pm", () => {
    expect(formatTime("2026-09-02T14:30:00Z")).toMatch(/(AM|PM)/);
  });
});
