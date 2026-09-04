import { describe, expect, it } from "vitest";
import { findFirstNextDayWakeEvent } from "./sleep";
import type { BabyEvent, EventType } from "./types";

function event(eventType: EventType, occurredAt: string): BabyEvent {
  return {
    id: `${eventType}-${occurredAt}`,
    baby_id: "baby",
    created_by: "user",
    event_type: eventType,
    occurred_at: occurredAt,
    milk_type: eventType === "milk" ? "formula" : null,
    amount_ml: eventType === "milk" ? 120 : null,
    diaper_type: eventType === "diaper" ? "wee" : null,
    poo_level: null,
    sleep_type: null,
    ended_at: null,
    note: null,
    created_at: occurredAt,
    updated_at: occurredAt,
  };
}

describe("findFirstNextDayWakeEvent", () => {
  it("uses the earliest milk or diaper on the next Hong Kong day", () => {
    const events = [
      event("milk", "2026-09-04T07:20:00+08:00"),
      event("diaper", "2026-09-04T06:55:00+08:00"),
      event("diaper", "2026-09-03T23:30:00+08:00"),
    ];

    expect(findFirstNextDayWakeEvent(events, "2026-09-03T21:45:00+08:00")?.occurred_at)
      .toBe("2026-09-04T06:55:00+08:00");
  });

  it("ignores other event types and later days", () => {
    const events = [
      event("food", "2026-09-04T07:00:00+08:00"),
      event("milk", "2026-09-05T07:00:00+08:00"),
    ];

    expect(findFirstNextDayWakeEvent(events, "2026-09-03T21:45:00+08:00")).toBeNull();
  });
});
