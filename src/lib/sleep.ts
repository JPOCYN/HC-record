import type { BabyEvent } from "./types";

const DEFAULT_TIME_ZONE = "Asia/Hong_Kong";

function dateKeyInTimeZone(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function nextDateKey(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function findFirstNextDayWakeEvent(
  events: BabyEvent[],
  sleepStartedAt: string,
  timeZone = DEFAULT_TIME_ZONE,
): BabyEvent | null {
  const wakeDate = nextDateKey(dateKeyInTimeZone(sleepStartedAt, timeZone));
  const sleepStartTime = Date.parse(sleepStartedAt);

  return events.reduce<BabyEvent | null>((earliest, event) => {
    if (event.event_type !== "milk" && event.event_type !== "diaper") return earliest;
    if (dateKeyInTimeZone(event.occurred_at, timeZone) !== wakeDate) return earliest;
    const eventTime = Date.parse(event.occurred_at);
    if (eventTime <= sleepStartTime) return earliest;
    if (!earliest || eventTime < Date.parse(earliest.occurred_at)) return event;
    return earliest;
  }, null);
}
