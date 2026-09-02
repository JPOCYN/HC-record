import { describe, expect, it } from "vitest";
import { ageLabel, formatScheduleTime, formatTime, shiftDate, startOfWeek, weekDates } from "./date";

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

  it("builds a Monday to Sunday week", () => {
    expect(startOfWeek("2026-09-02")).toBe("2026-08-31");
    expect(weekDates("2026-09-02")).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
      "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
  });

  it("formats optional timetable times", () => {
    expect(formatScheduleTime("14:30:00")).toBe("2:30 PM");
    expect(formatScheduleTime(null)).toBe("All day");
  });
});
