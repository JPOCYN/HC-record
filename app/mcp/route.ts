import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { createSupabaseForToken, verifySupabaseMcpToken } from "@/src/lib/supabase-server";
import type { BabyEvent, BabyProfile, EventType, Measurement, ScheduleItem } from "@/src/lib/types";

export const runtime = "nodejs";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const eventTypeSchema = z.enum(["milk", "food", "diaper", "shower", "sleep"]);

const handler = createMcpHandler((server) => {
  server.registerTool(
    "get_baby_profile",
    {
      title: "Get baby profile",
      description: "Read the baby's name, date of birth, gender, timezone, and current age context. Use this before interpreting dates or ages.",
      inputSchema: z.object({}).strict(),
      annotations: readOnlyAnnotations,
    },
    async (_input, context) => runTool(context.http?.authInfo?.token, async (supabase) => {
      const profile = await getProfile(supabase);
      return {
        name: profile.name,
        gender: profile.gender,
        date_of_birth: profile.date_of_birth,
        timezone: profile.timezone,
      };
    }),
  );

  server.registerTool(
    "get_latest_event",
    {
      title: "Get latest baby event",
      description: "Find the most recent milk, food, diaper, shower, or sleep record. Use for questions such as 'When was her last milk?' or 'When did she last sleep?'.",
      inputSchema: z.object({ event_type: eventTypeSchema }).strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ event_type }, context) => runTool(context.http?.authInfo?.token, async (supabase) => {
      const profile = await getProfile(supabase);
      const { data, error } = await supabase
        .from("events")
        .select("event_type, occurred_at, milk_type, amount_ml, diaper_type, poo_level, sleep_type, ended_at, note")
        .eq("baby_id", profile.id)
        .eq("event_type", event_type)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return { baby: profile.name, timezone: profile.timezone, event: data };
    }),
  );

  server.registerTool(
    "get_daily_summary",
    {
      title: "Get daily baby summary",
      description: "Return counts and milk totals for one Hong Kong calendar day, plus that day's chronological records.",
      inputSchema: z.object({ date: dateSchema.describe("Calendar date in YYYY-MM-DD format") }).strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ date }, context) => runTool(context.http?.authInfo?.token, async (supabase) => {
      const profile = await getProfile(supabase);
      const { start, end } = hongKongDay(date);
      const events = await queryEvents(supabase, profile.id, start, end);
      return summarize(profile, date, events);
    }),
  );

  server.registerTool(
    "get_events",
    {
      title: "Get baby records",
      description: "Read detailed feeding, diaper, shower, and sleep records within a date range of up to 90 days, including milk volume, food, diaper contents, poo level, and sleep duration. Optionally filter by event types.",
      inputSchema: z.object({
        start_date: dateSchema,
        end_date: dateSchema,
        event_types: z.array(eventTypeSchema).max(5).optional(),
      }).strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ start_date, end_date, event_types }, context) => runTool(context.http?.authInfo?.token, async (supabase) => {
      validateRange(start_date, end_date, 90);
      const profile = await getProfile(supabase);
      const start = hongKongDay(start_date).start;
      const end = hongKongDay(end_date).end;
      const events = await queryEvents(supabase, profile.id, start, end, event_types);
      return {
        baby: profile.name,
        timezone: profile.timezone,
        start_date,
        end_date,
        count: events.length,
        events: events.map(publicEvent),
      };
    }),
  );

  server.registerTool(
    "get_period_summary",
    {
      title: "Compare baby record patterns",
      description: "Summarize up to 90 days of records by day, including event counts and milk volume. Use for trend and comparison questions.",
      inputSchema: z.object({ start_date: dateSchema, end_date: dateSchema }).strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ start_date, end_date }, context) => runTool(context.http?.authInfo?.token, async (supabase) => {
      validateRange(start_date, end_date, 90);
      const profile = await getProfile(supabase);
      const events = await queryEvents(
        supabase,
        profile.id,
        hongKongDay(start_date).start,
        hongKongDay(end_date).end,
      );
      const days = new Map<string, BabyEvent[]>();
      for (const event of events) {
        const key = hongKongDateKey(event.occurred_at);
        days.set(key, [...(days.get(key) ?? []), event]);
      }
      return {
        baby: profile.name,
        timezone: profile.timezone,
        start_date,
        end_date,
        totals: countEvents(events),
        total_milk_ml: sumMilk(events),
        total_completed_sleep_minutes: sumSleepMinutes(events),
        days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
          date,
          counts: countEvents(rows),
          milk_ml: sumMilk(rows),
          completed_sleep_minutes: sumSleepMinutes(rows),
        })),
      };
    }),
  );

  server.registerTool(
    "get_growth_history",
    {
      title: "Get height and weight history",
      description: "Read dated height and weight measurements for growth questions. This returns recorded facts and does not provide a medical diagnosis.",
      inputSchema: z.object({
        start_date: dateSchema.optional(),
        end_date: dateSchema.optional(),
      }).strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ start_date, end_date }, context) => runTool(context.http?.authInfo?.token, async (supabase) => {
      if (start_date && end_date) validateRange(start_date, end_date, 730);
      const profile = await getProfile(supabase);
      let query = supabase
        .from("measurements")
        .select("measured_at, height_cm, weight_kg, note")
        .eq("baby_id", profile.id)
        .order("measured_at", { ascending: true })
        .limit(500);
      if (start_date) query = query.gte("measured_at", hongKongDay(start_date).start);
      if (end_date) query = query.lt("measured_at", hongKongDay(end_date).end);
      const { data, error } = await query;
      if (error) throw error;
      return {
        baby: profile.name,
        timezone: profile.timezone,
        measurements: (data as Pick<Measurement, "measured_at" | "height_cm" | "weight_kg" | "note">[]).map((row) => ({
          measured_at: row.measured_at,
          height_cm: row.height_cm,
          weight_kg: row.weight_kg,
          note: row.note,
        })),
      };
    }),
  );

  server.registerTool(
    "get_schedule",
    {
      title: "Get baby timetable",
      description: "Read school, doctor appointment, and important timetable entries for up to 90 days, including weekly repeating items.",
      inputSchema: z.object({ start_date: dateSchema, end_date: dateSchema }).strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ start_date, end_date }, context) => runTool(context.http?.authInfo?.token, async (supabase) => {
      validateRange(start_date, end_date, 90);
      const profile = await getProfile(supabase);
      const { data, error } = await supabase
        .from("schedule_items")
        .select("item_type, title, event_date, event_time, repeats_weekly, note")
        .eq("baby_id", profile.id)
        .lte("event_date", end_date)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true, nullsFirst: true })
        .limit(1000);
      if (error) throw error;
      const items = data as Pick<ScheduleItem, "item_type" | "title" | "event_date" | "event_time" | "repeats_weekly" | "note">[];
      const occurrences = calendarDates(start_date, end_date).flatMap((date) => items
        .filter((item) => scheduleItemOccursOn(item, date))
        .map((item) => ({
          date,
          time: item.event_time,
          item_type: item.item_type,
          title: item.title,
          repeats_weekly: item.repeats_weekly,
          note: item.note,
        })));
      return { baby: profile.name, timezone: profile.timezone, start_date, end_date, occurrences };
    }),
  );
});

const authenticatedHandler = withMcpAuth(handler, verifySupabaseMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authenticatedHandler as GET, authenticatedHandler as POST };

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

async function runTool(
  token: string | undefined,
  operation: (supabase: ReturnType<typeof createSupabaseForToken>) => Promise<Record<string, unknown>>,
) {
  if (!token) return toolFailure("Authentication is required.");
  try {
    const result = await operation(createSupabaseForToken(token));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read baby records.";
    return toolFailure(message);
  }
}

function toolFailure(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

async function getProfile(supabase: ReturnType<typeof createSupabaseForToken>): Promise<BabyProfile> {
  const { data, error } = await supabase
    .from("babies")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return data as BabyProfile;
}

async function queryEvents(
  supabase: ReturnType<typeof createSupabaseForToken>,
  babyId: string,
  start: string,
  end: string,
  eventTypes?: EventType[],
): Promise<BabyEvent[]> {
  let query = supabase
    .from("events")
    .select("*")
    .eq("baby_id", babyId)
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .order("occurred_at", { ascending: true })
    .limit(500);
  if (eventTypes?.length) query = query.in("event_type", eventTypes);
  const { data, error } = await query;
  if (error) throw error;
  return data as BabyEvent[];
}

function publicEvent(event: BabyEvent) {
  return {
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    milk_type: event.milk_type,
    amount_ml: event.amount_ml,
    diaper_type: event.diaper_type,
    poo_level: event.poo_level,
    sleep_type: event.sleep_type,
    ended_at: event.ended_at,
    note: event.note,
  };
}

function summarize(profile: BabyProfile, date: string, events: BabyEvent[]) {
  return {
    baby: profile.name,
    timezone: profile.timezone,
    date,
    counts: countEvents(events),
    total_milk_ml: sumMilk(events),
    total_completed_sleep_minutes: sumSleepMinutes(events),
    events: events.map(publicEvent),
  };
}

function countEvents(events: BabyEvent[]) {
  const counts: Record<EventType, number> = { milk: 0, food: 0, diaper: 0, shower: 0, sleep: 0 };
  for (const event of events) counts[event.event_type] += 1;
  return counts;
}

function sumMilk(events: BabyEvent[]) {
  return events.reduce((total, event) => total + (event.event_type === "milk" ? event.amount_ml ?? 0 : 0), 0);
}

function sumSleepMinutes(events: BabyEvent[]) {
  return events.reduce((total, event) => {
    if (event.event_type !== "sleep" || !event.ended_at) return total;
    return total + Math.max(0, Math.floor((Date.parse(event.ended_at) - Date.parse(event.occurred_at)) / 60_000));
  }, 0);
}

function hongKongDay(date: string) {
  return {
    start: new Date(`${date}T00:00:00+08:00`).toISOString(),
    end: new Date(`${date}T24:00:00+08:00`).toISOString(),
  };
}

function hongKongDateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function validateRange(startDate: string, endDate: string, maximumDays: number) {
  const start = Date.parse(`${startDate}T00:00:00+08:00`);
  const end = Date.parse(`${endDate}T00:00:00+08:00`);
  const days = Math.floor((end - start) / 86_400_000);
  if (days < 0) throw new Error("end_date must be on or after start_date.");
  if (days > maximumDays) throw new Error(`Date range cannot exceed ${maximumDays} days.`);
}

function calendarDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function scheduleItemOccursOn(
  item: Pick<ScheduleItem, "event_date" | "repeats_weekly">,
  date: string,
) {
  if (!item.repeats_weekly) return item.event_date === date;
  if (item.event_date > date) return false;
  return new Date(`${item.event_date}T00:00:00Z`).getUTCDay() === new Date(`${date}T00:00:00Z`).getUTCDay();
}
