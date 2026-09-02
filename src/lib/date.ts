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

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-HK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDayHeading(value: string): string {
  return new Intl.DateTimeFormat("en-HK", {
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

export function ageLabel(dateOfBirth: string, now = new Date()): string {
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
  const monthText = `${months} month${months === 1 ? "" : "s"}`;
  const dayText = `${days} day${days === 1 ? "" : "s"}`;
  return `${monthText}, ${dayText}`;
}

export function elapsedLabel(value: string, now = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
