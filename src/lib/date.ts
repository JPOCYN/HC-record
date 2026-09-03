const DATE_KEY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateKey(value: string | Date): string {
  return DATE_KEY.format(typeof value === "string" ? new Date(value) : value);
}

export function dayBounds(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatTime(value: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatShortDate(value: string, locale = "en-HK"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDayHeading(value: string, locale = "en-HK"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

export function toDateTimeLocal(value: string | Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateKey(value);
}

export function startOfWeek(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  const mondayOffset = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - mondayOffset);
  return dateKey(value);
}

export function weekDates(date: string): string[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export function formatScheduleTime(value: string | null, locale = "en-US", allDay = "All day"): string {
  if (!value) return allDay;
  const [hour = "0", minute = "0"] = value.split(":");
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(2000, 0, 1, Number(hour), Number(minute)));
}

export function isScheduleReminderActive(
  occurrenceDate: string,
  eventTime: string | null,
  now = new Date(),
  graceMinutes = 15,
): boolean {
  if (!eventTime) return true;
  const time = eventTime.slice(0, 8).padEnd(8, ":00");
  const eventAt = new Date(`${occurrenceDate}T${time}+08:00`);
  if (Number.isNaN(eventAt.getTime())) return true;
  return now.getTime() <= eventAt.getTime() + graceMinutes * 60_000;
}

export function scheduleOccursOn(
  item: { event_date: string; repeats_weekly: boolean; repeat_until?: string | null },
  date: string,
): boolean {
  if (!item.repeats_weekly) return item.event_date === date;
  if (item.event_date > date) return false;
  if (item.repeat_until && date > item.repeat_until) return false;
  return new Date(`${item.event_date}T12:00:00`).getDay() === new Date(`${date}T12:00:00`).getDay();
}

export function ageLabel(dateOfBirth: string, now = new Date(), language: "en" | "zh-Hant" = "en"): string {
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  let anchor = new Date(birth);
  anchor.setMonth(anchor.getMonth() + months);

  if (anchor > now) {
    months -= 1;
    anchor = new Date(birth);
    anchor.setMonth(anchor.getMonth() + months);
  }

  const days = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86_400_000));
  if (language === "zh-Hant") return `${months} 個月 ${days} 日`;
  const monthText = `${months} month${months === 1 ? "" : "s"}`;
  const dayText = `${days} day${days === 1 ? "" : "s"}`;
  return `${monthText}, ${dayText}`;
}

export function elapsedLabel(value: string, now = new Date(), language: "en" | "zh-Hant" = "en"): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return language === "zh-Hant" ? "剛剛" : "just now";
  if (minutes < 60) return language === "zh-Hant" ? `${minutes} 分鐘前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    if (language === "zh-Hant") return remainder ? `${hours} 小時 ${remainder} 分鐘前` : `${hours} 小時前`;
    return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return language === "zh-Hant" ? `${days} 日前` : `${days}d ago`;
}

export function durationLabel(
  startedAt: string,
  endedAt: string | Date = new Date(),
  language: "en" | "zh-Hant" = "en",
): string {
  const end = typeof endedAt === "string" ? new Date(endedAt) : endedAt;
  const minutes = Math.max(0, Math.floor((end.getTime() - new Date(startedAt).getTime()) / 60_000));
  return minutesDurationLabel(minutes, language);
}

export function minutesDurationLabel(totalMinutes: number, language: "en" | "zh-Hant" = "en"): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (language === "zh-Hant") {
    if (!hours) return `${minutes} 分鐘`;
    return remainder ? `${hours} 小時 ${remainder} 分鐘` : `${hours} 小時`;
  }
  if (!hours) return `${minutes}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
