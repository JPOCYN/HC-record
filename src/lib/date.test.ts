import { describe, expect, it } from "vitest";
import { ageLabel, formatScheduleTime, formatTime, isScheduleReminderActive, scheduleOccursOn, shiftDate, startOfWeek, weekDates } from "./date";

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

  it("keeps timed reminders for 15 minutes after their Hong Kong start time", () => {
    expect(isScheduleReminderActive("2026-09-02", "15:00:00", new Date("2026-09-02T07:15:00Z"))).toBe(true);
    expect(isScheduleReminderActive("2026-09-02", "15:00:00", new Date("2026-09-02T07:15:01Z"))).toBe(false);
    expect(isScheduleReminderActive("2026-09-02", null, new Date("2026-09-02T23:59:00Z"))).toBe(true);
  });

  it("stops weekly timetable items after their final date", () => {
    const item = { event_date: "2026-09-02", repeats_weekly: true, repeat_until: "2026-10-02" };
    expect(scheduleOccursOn(item, "2026-09-30")).toBe(true);
    expect(scheduleOccursOn(item, "2026-10-07")).toBe(false);
  });
});
