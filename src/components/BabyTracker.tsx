"use client";

import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ageLabel,
  dateKey,
  elapsedLabel,
  formatDayHeading,
  formatScheduleTime,
  formatShortDate,
  formatTime,
  fromDateTimeLocal,
  isScheduleReminderActive,
  shiftDate,
  startOfWeek,
  toDateTimeLocal,
  weekDates,
} from "@/src/lib/date";
import { unlockHousehold } from "@/src/lib/household-auth";
import { I18nProvider, useI18n, type TranslationKey } from "@/src/lib/i18n";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/src/lib/supabase-browser";
import { ageInMonths, formatWhoPercentile, whoPercentile, whoReferenceValue, WHO_PERCENTILE_CURVES, type WhoGrowthMetric } from "@/src/lib/who-growth";
import type {
  BabyEvent,
  BabyProfile,
  BloodType,
  DiaperType,
  EventDraft,
  EventType,
  Measurement,
  MeasurementDraft,
  MilkType,
  ScheduleDraft,
  ScheduleItem,
  ScheduleItemType,
} from "@/src/lib/types";

type Tab = "today" | "week" | "history" | "growth" | "settings";

const EVENT_META: Record<EventType, { emoji: string; labelKey: TranslationKey; color: string }> = {
  milk: { emoji: "🍼", labelKey: "milk", color: "peach" },
  food: { emoji: "🥣", labelKey: "food", color: "sun" },
  diaper: { emoji: "🩲", labelKey: "diaper", color: "sage" },
  shower: { emoji: "🚿", labelKey: "shower", color: "sky" },
};

const SCHEDULE_META: Record<ScheduleItemType, { emoji: string; labelKey: TranslationKey; color: string }> = {
  school: { emoji: "🎒", labelKey: "school", color: "schedule-school" },
  doctor: { emoji: "🩺", labelKey: "doctor", color: "schedule-doctor" },
  important: { emoji: "⭐", labelKey: "important", color: "schedule-important" },
};

const BLOOD_TYPES: readonly BloodType[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_BABY_ID = "00000000-0000-0000-0000-000000000002";

function makeDemoProfile(): BabyProfile {
  const now = new Date().toISOString();
  return {
    id: DEMO_BABY_ID,
    owner_id: DEMO_USER_ID,
    name: "Harper",
    gender: "female",
    date_of_birth: "2025-11-15",
    blood_type: null,
    birth_weight_kg: null,
    birth_time: null,
    gestational_weeks: null,
    gestational_days: null,
    timezone: "Asia/Hong_Kong",
    created_at: now,
    updated_at: now,
  };
}

function makeDemoEvents(): BabyEvent[] {
  const now = Date.now();
  const rows: Array<[EventType, number, number | null, string | null, DiaperType | null, number | null]> = [
    ["milk", 42, 120, null, null, null],
    ["diaper", 104, null, null, "wee", null],
    ["food", 188, null, "Banana and oatmeal", null, null],
    ["diaper", 266, null, null, "both", 3],
    ["shower", 338, null, null, null, null],
  ];
  return rows.map(([event_type, minutesAgo, amount_ml, note, diaper_type, poo_level]) => {
    const stamp = new Date(now - minutesAgo * 60_000).toISOString();
    return {
      id: crypto.randomUUID(),
      baby_id: DEMO_BABY_ID,
      created_by: DEMO_USER_ID,
      event_type,
      occurred_at: stamp,
      milk_type: event_type === "milk" ? "formula" : null,
      amount_ml,
      diaper_type,
      poo_level,
      note,
      created_at: stamp,
      updated_at: stamp,
    };
  });
}

function makeDemoMeasurements(): Measurement[] {
  const rows = [
    ["2026-05-15T10:00:00+08:00", 65.2, 7.1],
    ["2026-06-15T10:00:00+08:00", 67.0, 7.5],
    ["2026-07-15T10:00:00+08:00", 68.4, 7.8],
    ["2026-08-15T10:00:00+08:00", 70.1, 8.2],
  ] as const;
  return rows.map(([measured_at, height_cm, weight_kg]) => ({
    id: crypto.randomUUID(),
    baby_id: DEMO_BABY_ID,
    created_by: DEMO_USER_ID,
    measured_at: new Date(measured_at).toISOString(),
    height_cm,
    weight_kg,
    note: null,
    created_at: new Date(measured_at).toISOString(),
    updated_at: new Date(measured_at).toISOString(),
  })).sort(sortMeasurements);
}

function makeDemoSchedule(): ScheduleItem[] {
  return [];
}

export function BabyTracker() {
  return <I18nProvider><BabyTrackerApp /></I18nProvider>;
}

function BabyTrackerApp() {
  const { language, locale, t } = useI18n();
  const configured = hasSupabaseConfig();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(!configured);
  const [profile, setProfile] = useState<BabyProfile | null>(null);
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [editingEvent, setEditingEvent] = useState<BabyEvent | null>(null);
  const [editingScheduleItem, setEditingScheduleItem] = useState<ScheduleItem | null>(null);
  const [addingScheduleDate, setAddingScheduleDate] = useState<string | null>(null);
  const [quickEventType, setQuickEventType] = useState<EventType | null>(null);
  const [toast, setToast] = useState<{ event: BabyEvent; message: string } | null>(null);
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const profileId = profile?.id;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateConnection = () => {
      const online = window.navigator.onLine;
      setIsOnline(online);
      if (online) setOfflineNotice(false);
    };
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthChecked(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!supabase || !session) {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem("baby-record-demo") : null;
      if (saved) {
        const parsed = JSON.parse(saved) as {
          profile: BabyProfile;
          events: BabyEvent[];
          measurements: Measurement[];
          scheduleItems?: ScheduleItem[];
        };
        setProfile(parsed.profile.name === "Baby Girl" ? { ...parsed.profile, name: "Harper" } : parsed.profile);
        setEvents([...parsed.events].sort(sortNewest));
        setMeasurements([...parsed.measurements].sort(sortMeasurements));
        setScheduleItems([...(parsed.scheduleItems ?? [])].sort(sortScheduleItems));
      } else {
        setProfile(makeDemoProfile());
        setEvents(makeDemoEvents());
        setMeasurements(makeDemoMeasurements());
        setScheduleItems(makeDemoSchedule());
      }
      setLoading(false);
      return;
    }

    const { data: existingBaby, error: babyError } = await supabase
      .from("babies")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (babyError) {
      setError(babyError.message);
      setLoading(false);
      return;
    }

    let baby = existingBaby as BabyProfile | null;
    if (!baby) {
      const { data: createdBaby, error: createError } = await supabase
        .from("babies")
        .insert({
          owner_id: session.user.id,
          name: "Harper",
          gender: "female",
          date_of_birth: "2025-11-15",
          timezone: "Asia/Hong_Kong",
        })
        .select("*")
        .single();
      if (createError) {
        setError(createError.message);
        setLoading(false);
        return;
      }
      baby = createdBaby as BabyProfile;
    }

    const [eventResult, measurementResult, scheduleResult] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("baby_id", baby.id)
        .order("occurred_at", { ascending: false })
        .limit(2000),
      supabase
        .from("measurements")
        .select("*")
        .eq("baby_id", baby.id)
        .order("measured_at", { ascending: false })
        .limit(500),
      supabase
        .from("schedule_items")
        .select("*")
        .eq("baby_id", baby.id)
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true, nullsFirst: true })
        .limit(1000),
    ]);

    if (eventResult.error || measurementResult.error || scheduleResult.error) {
      setError(eventResult.error?.message ?? measurementResult.error?.message ?? scheduleResult.error?.message ?? "Unable to load records.");
      setLoading(false);
      return;
    }

    setProfile(baby);
    setEvents(eventResult.data as BabyEvent[]);
    setMeasurements(measurementResult.data as Measurement[]);
    setScheduleItems(scheduleResult.data as ScheduleItem[]);
    setLoading(false);
  }, [session, supabase]);

  useEffect(() => {
    if (!authChecked) return;
    if (configured && !session) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return loadData();
    });
    return () => {
      active = false;
    };
  }, [authChecked, configured, loadData, session]);

  useEffect(() => {
    if (configured || loading || !profile) return;
    window.localStorage.setItem(
      "baby-record-demo",
      JSON.stringify({ profile, events, measurements, scheduleItems }),
    );
  }, [configured, events, loading, measurements, profile, scheduleItems]);

  useEffect(() => {
    if (!configured || !supabase || !session || !profileId) return;
    const channel = supabase
      .channel(`harper-records:${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `baby_id=eq.${profileId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as Pick<BabyEvent, "id">;
            setEvents((current) => current.filter((item) => item.id !== deleted.id));
            return;
          }
          const changed = payload.new as BabyEvent;
          setEvents((current) => upsertById(current, changed, sortNewest));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "events" },
        (payload) => {
          const deleted = payload.old as Pick<BabyEvent, "id">;
          setEvents((current) => current.filter((item) => item.id !== deleted.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "measurements", filter: `baby_id=eq.${profileId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as Pick<Measurement, "id">;
            setMeasurements((current) => current.filter((item) => item.id !== deleted.id));
            return;
          }
          const changed = payload.new as Measurement;
          setMeasurements((current) => upsertById(current, changed, sortMeasurements));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "measurements" },
        (payload) => {
          const deleted = payload.old as Pick<Measurement, "id">;
          setMeasurements((current) => current.filter((item) => item.id !== deleted.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_items", filter: `baby_id=eq.${profileId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const deleted = payload.old as Pick<ScheduleItem, "id">;
            setScheduleItems((current) => current.filter((item) => item.id !== deleted.id));
            return;
          }
          const changed = payload.new as ScheduleItem;
          setScheduleItems((current) => upsertById(current, changed, sortScheduleItems));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "schedule_items" },
        (payload) => {
          const deleted = payload.old as Pick<ScheduleItem, "id">;
          setScheduleItems((current) => current.filter((item) => item.id !== deleted.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "babies", filter: `id=eq.${profileId}` },
        (payload) => setProfile(payload.new as BabyProfile),
      )
      .on("broadcast", { event: "event_deleted" }, ({ payload }) => {
        const id = typeof payload?.id === "string" ? payload.id : null;
        if (id) setEvents((current) => current.filter((item) => item.id !== id));
      })
      .on("broadcast", { event: "schedule_deleted" }, ({ payload }) => {
        const id = typeof payload?.id === "string" ? payload.id : null;
        if (id) setScheduleItems((current) => current.filter((item) => item.id !== id));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeStatus("offline");
        else setRealtimeStatus("connecting");
      });
    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [configured, profileId, session, supabase]);

  function requireOnline(): boolean {
    if (!configured || isOnline) return true;
    setOfflineNotice(true);
    return false;
  }

  async function addEvent(draft: EventDraft): Promise<BabyEvent | null> {
    if (!requireOnline()) return null;
    if (!profile) return null;
    setBusy(true);
    setError(null);
    const stamp = new Date().toISOString();
    const localEvent: BabyEvent = {
      id: crypto.randomUUID(),
      baby_id: profile.id,
      created_by: session?.user.id ?? DEMO_USER_ID,
      event_type: draft.event_type,
      occurred_at: draft.occurred_at,
      milk_type: draft.event_type === "milk" ? draft.milk_type ?? null : null,
      amount_ml: draft.event_type === "milk" ? draft.amount_ml ?? null : null,
      diaper_type: draft.event_type === "diaper" ? draft.diaper_type ?? null : null,
      poo_level: draft.event_type === "diaper" && (draft.diaper_type === "poo" || draft.diaper_type === "both") ? draft.poo_level ?? null : null,
      note: draft.note?.trim() || null,
      created_at: stamp,
      updated_at: stamp,
    };

    if (!supabase || !session) {
      setEvents((current) => [localEvent, ...current].sort(sortNewest));
      setBusy(false);
      return localEvent;
    }

    const { data, error: insertError } = await supabase
      .from("events")
      .insert({
        id: localEvent.id,
        baby_id: profile.id,
        created_by: session.user.id,
        event_type: localEvent.event_type,
        occurred_at: localEvent.occurred_at,
        milk_type: localEvent.milk_type,
        amount_ml: localEvent.amount_ml,
        diaper_type: localEvent.diaper_type,
        poo_level: localEvent.poo_level,
        note: localEvent.note,
      })
      .select("*")
      .single();

    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return null;
    }
    const saved = data as BabyEvent;
    setEvents((current) => [saved, ...current].sort(sortNewest));
    setBusy(false);
    return saved;
  }

  async function quickAdd(type: EventType) {
    if (busy) return;
    if (!requireOnline()) return;
    if (type !== "shower") {
      setQuickEventType(type);
      return;
    }
    const saved = await addEvent({ event_type: type, occurred_at: new Date().toISOString() });
    if (saved) {
      setToast({ event: saved, message: t("savedAt", { type: t(EVENT_META[type].labelKey), time: formatTime(saved.occurred_at, locale) }) });
    }
  }

  async function saveQuickEvent(draft: EventDraft) {
    const saved = await addEvent(draft);
    if (!saved) return;
    setQuickEventType(null);
    setToast({ event: saved, message: t("savedAt", { type: t(EVENT_META[saved.event_type].labelKey), time: formatTime(saved.occurred_at, locale) }) });
  }

  async function updateEvent(event: BabyEvent) {
    if (!requireOnline()) return;
    setBusy(true);
    setError(null);
    if (!supabase || !session) {
      setEvents((current) => current.map((item) => (item.id === event.id ? event : item)).sort(sortNewest));
      setEditingEvent(null);
      setBusy(false);
      return;
    }
    const { data, error: updateError } = await supabase
      .from("events")
      .update({
        occurred_at: event.occurred_at,
        milk_type: event.event_type === "milk" ? event.milk_type : null,
        amount_ml: event.event_type === "milk" ? event.amount_ml : null,
        diaper_type: event.event_type === "diaper" ? event.diaper_type : null,
        poo_level: event.event_type === "diaper" && (event.diaper_type === "poo" || event.diaper_type === "both") ? event.poo_level : null,
        note: event.note?.trim() || null,
      })
      .eq("id", event.id)
      .select("*")
      .single();
    if (updateError) setError(updateError.message);
    else setEvents((current) => current.map((item) => (item.id === event.id ? (data as BabyEvent) : item)).sort(sortNewest));
    setEditingEvent(null);
    setBusy(false);
  }

  async function deleteEvent(id: string) {
    if (!requireOnline()) return;
    setBusy(true);
    setError(null);
    if (supabase && session) {
      const { error: deleteError } = await supabase.from("events").delete().eq("id", id);
      if (deleteError) {
        setError(deleteError.message);
        setBusy(false);
        return;
      }
      void realtimeChannelRef.current?.send({ type: "broadcast", event: "event_deleted", payload: { id } });
    }
    setEvents((current) => current.filter((item) => item.id !== id));
    setToast(null);
    setEditingEvent(null);
    setBusy(false);
  }

  async function addMeasurement(draft: MeasurementDraft) {
    if (!requireOnline()) return;
    if (!profile) return;
    setBusy(true);
    setError(null);
    const stamp = new Date().toISOString();
    const localMeasurement: Measurement = {
      id: crypto.randomUUID(),
      baby_id: profile.id,
      created_by: session?.user.id ?? DEMO_USER_ID,
      measured_at: draft.measured_at,
      height_cm: draft.height_cm,
      weight_kg: draft.weight_kg,
      note: draft.note?.trim() || null,
      created_at: stamp,
      updated_at: stamp,
    };
    if (!supabase || !session) {
      setMeasurements((current) => [localMeasurement, ...current].sort(sortMeasurements));
      setBusy(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from("measurements")
      .insert(localMeasurement)
      .select("*")
      .single();
    if (insertError) setError(insertError.message);
    else setMeasurements((current) => [data as Measurement, ...current].sort(sortMeasurements));
    setBusy(false);
  }

  async function deleteMeasurement(id: string): Promise<boolean> {
    if (!requireOnline()) return false;
    setBusy(true);
    setError(null);
    if (supabase && session) {
      const { error: deleteError } = await supabase.from("measurements").delete().eq("id", id);
      if (deleteError) {
        setError(deleteError.message);
        setBusy(false);
        return false;
      }
    }
    setMeasurements((current) => current.filter((item) => item.id !== id));
    setBusy(false);
    return true;
  }

  async function addScheduleItem(draft: ScheduleDraft): Promise<boolean> {
    if (!requireOnline()) return false;
    if (!profile) return false;
    setBusy(true);
    setError(null);
    const stamp = new Date().toISOString();
    const localItem: ScheduleItem = {
      id: crypto.randomUUID(),
      baby_id: profile.id,
      created_by: session?.user.id ?? DEMO_USER_ID,
      item_type: draft.item_type,
      title: draft.title.trim(),
      event_date: draft.event_date,
      event_time: draft.event_time || null,
      repeats_weekly: draft.repeats_weekly,
      note: draft.note?.trim() || null,
      created_at: stamp,
      updated_at: stamp,
    };
    if (!supabase || !session) {
      setScheduleItems((current) => [localItem, ...current].sort(sortScheduleItems));
      setBusy(false);
      return true;
    }
    const { data, error: insertError } = await supabase
      .from("schedule_items")
      .insert(localItem)
      .select("*")
      .single();
    if (insertError) setError(insertError.message);
    else setScheduleItems((current) => [data as ScheduleItem, ...current].sort(sortScheduleItems));
    setBusy(false);
    return !insertError;
  }

  async function updateScheduleItem(item: ScheduleItem): Promise<boolean> {
    if (!requireOnline()) return false;
    setBusy(true);
    setError(null);
    if (!supabase || !session) {
      setScheduleItems((current) => current.map((row) => (row.id === item.id ? item : row)).sort(sortScheduleItems));
      setBusy(false);
      return true;
    }
    const { data, error: updateError } = await supabase
      .from("schedule_items")
      .update({
        item_type: item.item_type,
        title: item.title.trim(),
        event_date: item.event_date,
        event_time: item.event_time || null,
        repeats_weekly: item.repeats_weekly,
        note: item.note?.trim() || null,
      })
      .eq("id", item.id)
      .select("*")
      .single();
    if (updateError) setError(updateError.message);
    else setScheduleItems((current) => current.map((row) => (row.id === item.id ? data as ScheduleItem : row)).sort(sortScheduleItems));
    setBusy(false);
    return !updateError;
  }

  async function deleteScheduleItem(id: string): Promise<boolean> {
    if (!requireOnline()) return false;
    setBusy(true);
    setError(null);
    if (supabase && session) {
      const { error: deleteError } = await supabase.from("schedule_items").delete().eq("id", id);
      if (deleteError) {
        setError(deleteError.message);
        setBusy(false);
        return false;
      }
      void realtimeChannelRef.current?.send({ type: "broadcast", event: "schedule_deleted", payload: { id } });
    }
    setScheduleItems((current) => current.filter((item) => item.id !== id));
    setEditingScheduleItem(null);
    setBusy(false);
    return true;
  }

  async function saveProfile(next: BabyProfile): Promise<boolean> {
    if (!requireOnline()) return false;
    setBusy(true);
    setError(null);
    if (!supabase || !session) {
      setProfile(next);
      setBusy(false);
      return true;
    }
    const { data, error: updateError } = await supabase
      .from("babies")
      .update({
        name: next.name.trim(),
        date_of_birth: next.date_of_birth,
        blood_type: next.blood_type,
        birth_weight_kg: next.birth_weight_kg,
        birth_time: next.birth_time || null,
        gestational_weeks: next.gestational_weeks,
        gestational_days: next.gestational_weeks == null ? null : next.gestational_days,
        timezone: next.timezone,
      })
      .eq("id", next.id)
      .select("*")
      .single();
    if (updateError) setError(updateError.message);
    else setProfile(data as BabyProfile);
    setBusy(false);
    return !updateError;
  }

  if (!authChecked) return <LoadingScreen />;
  if (configured && !session) return <PinScreen />;
  if (loading) return <LoadingScreen />;
  if (!profile) return <LoadingScreen label={t("preparingProfile")} />;

  const today = dateKey(now);
  const todayEvents = events.filter((event) => dateKey(event.occurred_at) === today);
  const selectedEvents = events.filter((event) => dateKey(event.occurred_at) === selectedDate);
  const latestMilk = events.find((event) => event.event_type === "milk");
  const latestFood = events.find((event) => event.event_type === "food");
  const todaySchedule = scheduleItems.filter(
    (item) => scheduleOccursOn(item, today) && isScheduleReminderActive(today, item.event_time, now),
  );

  function openScheduleEditor(date: string) {
    if (!requireOnline()) return;
    setAddingScheduleDate(date);
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-heading">
          <div className="hero-profile">
            <p className="eyebrow">{t("babyRecord")}</p>
            <h1>{profile.name}</h1>
          </div>
          <time className="hero-time" dateTime={now.toISOString()}>{formatCurrentTime(now, locale)}</time>
        </div>
        <p className="baby-age"><span>{formatCurrentDate(now, locale)}</span> · {t("girl")} · {ageLabel(profile.date_of_birth, now, language)}</p>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={t("dismissError")}>×</button>
        </div>
      ) : null}

      <section className="screen-content">
        {tab === "today" ? (
          <TodayView
            events={todayEvents}
            latestMilk={latestMilk}
            latestFood={latestFood}
            busy={busy}
            onQuickAdd={quickAdd}
            onEdit={setEditingEvent}
            onDelete={deleteEvent}
            schedule={todaySchedule}
          />
        ) : null}
        {tab === "week" ? (
          <WeekView
            items={scheduleItems}
            busy={busy}
            onAdd={openScheduleEditor}
            onEdit={setEditingScheduleItem}
          />
        ) : null}
        {tab === "history" ? (
          <HistoryView
            selectedDate={selectedDate}
            events={selectedEvents}
            onDateChange={setSelectedDate}
            onEdit={setEditingEvent}
            onDelete={deleteEvent}
          />
        ) : null}
        {tab === "growth" ? (
          <GrowthView dateOfBirth={profile.date_of_birth} measurements={measurements} busy={busy} onAdd={addMeasurement} onDelete={deleteMeasurement} />
        ) : null}
        {tab === "settings" ? (
          <SettingsView
            profile={profile}
            configured={configured}
            busy={busy}
            isOnline={isOnline}
            realtimeStatus={realtimeStatus}
            onSave={saveProfile}
            onSignOut={configured && supabase ? () => void supabase.auth.signOut({ scope: "local" }) : undefined}
          />
        ) : null}
      </section>

      <nav className="bottom-nav" aria-label={t("primaryNavigation")}>
        <NavButton active={tab === "today"} icon="⌂" label={t("today")} onClick={() => setTab("today")} />
        <NavButton active={tab === "week"} icon="▦" label={t("week")} onClick={() => setTab("week")} />
        <NavButton active={tab === "history"} icon="◫" label={t("history")} onClick={() => setTab("history")} />
        <NavButton active={tab === "growth"} icon="↗" label={t("growth")} onClick={() => setTab("growth")} />
        <NavButton active={tab === "settings"} icon="⚙" label={t("settings")} onClick={() => setTab("settings")} />
      </nav>

      {editingEvent ? (
        <EventEditor
          event={editingEvent}
          busy={busy}
          onClose={() => setEditingEvent(null)}
          onSave={updateEvent}
          onDelete={() => void deleteEvent(editingEvent.id)}
        />
      ) : null}

      {quickEventType ? (
        <QuickEventEditor
          type={quickEventType}
          busy={busy}
          onClose={() => setQuickEventType(null)}
          onSave={saveQuickEvent}
        />
      ) : null}

      {addingScheduleDate ? (
        <ScheduleEditor
          defaultDate={addingScheduleDate}
          busy={busy}
          onClose={() => setAddingScheduleDate(null)}
          onSave={async (draft) => {
            if (await addScheduleItem(draft)) setAddingScheduleDate(null);
          }}
        />
      ) : null}

      {editingScheduleItem ? (
        <ScheduleEditor
          item={editingScheduleItem}
          defaultDate={editingScheduleItem.event_date}
          busy={busy}
          onClose={() => setEditingScheduleItem(null)}
          onSave={async (draft) => {
            if (await updateScheduleItem({ ...editingScheduleItem, ...draft })) setEditingScheduleItem(null);
          }}
          onDelete={async () => { await deleteScheduleItem(editingScheduleItem.id); }}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          <div><strong>{t("saved")}</strong><span>{toast.message}</span></div>
          <button type="button" onClick={() => void deleteEvent(toast.event.id)}>{t("undo")}</button>
          <button type="button" onClick={() => { setEditingEvent(toast.event); setToast(null); }}>{t("details")}</button>
          <button className="toast-close" type="button" onClick={() => setToast(null)} aria-label={t("close")}>×</button>
        </div>
      ) : null}

      {offlineNotice ? <OfflineNotice onClose={() => setOfflineNotice(false)} /> : null}
    </main>
  );
}

function TodayView({
  events,
  latestMilk,
  latestFood,
  busy,
  onQuickAdd,
  onEdit,
  onDelete,
  schedule,
}: {
  events: BabyEvent[];
  latestMilk?: BabyEvent;
  latestFood?: BabyEvent;
  busy: boolean;
  onQuickAdd: (type: EventType) => void;
  onEdit: (event: BabyEvent) => void;
  onDelete: (id: string) => Promise<void>;
  schedule: ScheduleItem[];
}) {
  const { language, t } = useI18n();
  const milkEvents = events.filter((event) => event.event_type === "milk");
  const totalMilk = sumMilk(events);
  return (
    <div className="today-view">
      <section className="quick-record-section">
        <div className="section-title"><div><p className="eyebrow">{t("quickRecord")}</p><h2>{t("whatHappened")}</h2></div><span>{t("addImportantDetails")}</span></div>
        <div className="quick-grid">
          {(Object.keys(EVENT_META) as EventType[]).map((type) => {
            const meta = EVENT_META[type];
            return (
              <button
                key={type}
                className={`quick-button ${meta.color}`}
                type="button"
                disabled={busy}
                onClick={() => onQuickAdd(type)}
              >
                <span className="quick-emoji" aria-hidden="true">{meta.emoji}</span>
                <strong>{t(meta.labelKey)}</strong>
                <small>{type === "shower" ? t("recordNow") : t("addDetails")}</small>
              </button>
            );
          })}
        </div>
      </section>

      {schedule.length ? <TodaySchedule items={schedule} /> : null}

      <section className="last-cards" aria-label={t("latestFeeding")}>
        <div className="last-card"><span>{t("lastMilk")}</span><strong>{latestMilk ? elapsedLabel(latestMilk.occurred_at, new Date(), language) : t("noRecord")}</strong></div>
        <div className="last-card"><span>{t("lastFood")}</span><strong>{latestFood ? elapsedLabel(latestFood.occurred_at, new Date(), language) : t("noRecord")}</strong></div>
        <div className="last-card milk-total-card"><div><span>{t("todaysMilk")}</span><strong>{totalMilk} ml</strong></div><small>{t("bottlesRecorded", { count: milkEvents.length })}</small></div>
      </section>

      <section className="timeline-section">
        <div className="section-title"><div><p className="eyebrow">{t("today")}</p><h2>{t("recordCount", { count: events.length })}</h2></div></div>
        <SummaryCounts events={events} />
        <EventList events={events} onEdit={onEdit} onDelete={onDelete} empty={t("nothingToday")} />
      </section>
    </div>
  );
}

function HistoryView({
  selectedDate,
  events,
  onDateChange,
  onEdit,
  onDelete,
}: {
  selectedDate: string;
  events: BabyEvent[];
  onDateChange: (date: string) => void;
  onEdit: (event: BabyEvent) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const today = dateKey(new Date());
  return (
    <section>
      <div className="section-title"><div><p className="eyebrow">{t("history")}</p><h2>{formatDayHeading(selectedDate, locale)}</h2></div></div>
      <div className="date-switcher">
        <button type="button" onClick={() => onDateChange(shiftDate(selectedDate, -1))} aria-label={t("previousDay")}>‹</button>
        <label>
          <span className="sr-only">{t("chooseDate")}</span>
          <input type="date" value={selectedDate} max={today} onChange={(event) => onDateChange(event.target.value)} />
        </label>
        <button type="button" disabled={selectedDate >= today} onClick={() => onDateChange(shiftDate(selectedDate, 1))} aria-label={t("nextDay")}>›</button>
      </div>
      <SummaryCounts events={events} />
      <DayInsights events={events} />
      <EventList events={events} onEdit={onEdit} onDelete={onDelete} empty={t("noRecordsDay")} />
    </section>
  );
}

function TodaySchedule({ items }: { items: ScheduleItem[] }) {
  const { locale, t } = useI18n();
  return (
    <section className="today-schedule" aria-label={t("todaysTimetable")}>
      <div className="today-schedule-heading"><div><p className="eyebrow">{t("todaysTimetable")}</p><h2>{t("dontForget")}</h2></div><span>{t("plannedCount", { count: items.length })}</span></div>
      <div className="today-schedule-list">
        {[...items].sort(sortScheduleItems).map((item) => {
          const meta = SCHEDULE_META[item.item_type];
          return <div className="today-schedule-item" key={item.id}><span className={`schedule-icon ${meta.color}`}>{meta.emoji}</span><div><strong>{item.title}</strong><small>{formatScheduleTime(item.event_time, locale, t("allDay"))}{item.note ? ` · ${item.note}` : ""}</small></div></div>;
        })}
      </div>
    </section>
  );
}

function WeekView({
  items,
  busy,
  onAdd,
  onEdit,
}: {
  items: ScheduleItem[];
  busy: boolean;
  onAdd: (date: string) => void;
  onEdit: (item: ScheduleItem) => void;
}) {
  const { locale, t } = useI18n();
  const today = dateKey(new Date());
  const [week, setWeek] = useState(() => startOfWeek(today));
  const dates = weekDates(week);

  return (
    <section>
      <div className="section-title schedule-title">
        <div><p className="eyebrow">{t("babyTimetable")}</p><h2>{t("harpersWeek")}</h2></div>
        <button className="small-action" type="button" disabled={busy} onClick={() => onAdd(today)}>{t("add")}</button>
      </div>
      <div className="week-switcher">
        <button type="button" onClick={() => setWeek(shiftDate(week, -7))} aria-label={t("previousWeek")}>‹</button>
        <button className="week-label" type="button" onClick={() => setWeek(startOfWeek(today))}>{formatWeekHeading(dates, locale)}</button>
        <button type="button" onClick={() => setWeek(shiftDate(week, 7))} aria-label={t("nextWeek")}>›</button>
      </div>
      <div className="week-list">
        {dates.map((date) => {
          const dayItems = items.filter((item) => scheduleOccursOn(item, date)).sort(sortScheduleItems);
          const isToday = date === today;
          return (
            <article className={`week-day ${isToday ? "today" : ""}`} key={date}>
              <div className="week-day-date">
                <span>{formatWeekday(date, locale)}</span>
                <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
                {isToday ? <small>{t("today")}</small> : null}
              </div>
              <div className="week-day-content">
                {dayItems.length ? dayItems.map((item) => {
                  const meta = SCHEDULE_META[item.item_type];
                  return (
                    <button className={`schedule-row ${meta.color}`} type="button" key={`${item.id}-${date}`} onClick={() => onEdit(item)}>
                      <span className="schedule-row-emoji">{meta.emoji}</span>
                      <span className="schedule-row-copy"><strong>{item.title}</strong><small>{formatScheduleTime(item.event_time, locale, t("allDay"))}{item.repeats_weekly ? ` · ${t("everyWeek")}` : ""}{item.note ? ` · ${item.note}` : ""}</small></span>
                      <span className="chevron">›</span>
                    </button>
                  );
                }) : <button className="empty-day" type="button" onClick={() => onAdd(date)}>{t("nothingPlanned")} <span>+</span></button>}
              </div>
              <button className="day-add" type="button" disabled={busy} onClick={() => onAdd(date)} aria-label={t("addTimetableOn", { date })}>+</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleEditor({
  item,
  defaultDate,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  item?: ScheduleItem;
  defaultDate: string;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ScheduleDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<ScheduleItemType>(item?.item_type ?? "school");
  const [title, setTitle] = useState(item?.title ?? t("school"));
  const [eventDate, setEventDate] = useState(item?.event_date ?? defaultDate);
  const [eventTime, setEventTime] = useState(item?.event_time?.slice(0, 5) ?? "");
  const [repeatsWeekly, setRepeatsWeekly] = useState(item?.repeats_weekly ?? true);
  const [note, setNote] = useState(item?.note ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const meta = SCHEDULE_META[type];

  function chooseType(nextType: ScheduleItemType) {
    const currentDefault = t(SCHEDULE_META[type].labelKey);
    setType(nextType);
    if (!title.trim() || title === currentDefault) setTitle(t(SCHEDULE_META[nextType].labelKey));
    if (!item) setRepeatsWeekly(nextType === "school");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title">
        <div className="sheet-handle" />
        <div className="sheet-title"><div className={`schedule-icon ${meta.color}`}>{meta.emoji}</div><div><p className="eyebrow">{item ? t("editTimetable") : t("newTimetable")}</p><h2 id="schedule-editor-title">{item ? item.title : t("addToWeek")}</h2></div><button type="button" onClick={onClose} aria-label={t("close")}>×</button></div>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          void onSave({ item_type: type, title: title.trim(), event_date: eventDate, event_time: eventTime || null, repeats_weekly: repeatsWeekly, note: note.trim() || null });
        }}>
          <fieldset className="schedule-type-picker"><legend>{t("whatIsIt")}</legend><div>{(Object.keys(SCHEDULE_META) as ScheduleItemType[]).map((option) => <button className={type === option ? "selected" : ""} type="button" key={option} onClick={() => chooseType(option)} aria-pressed={type === option}><span>{SCHEDULE_META[option].emoji}</span>{t(SCHEDULE_META[option].labelKey)}</button>)}</div></fieldset>
          <label><span>{t("name")}</span><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={t("school")} required /></label>
          <div className="form-grid schedule-date-time">
            <label><span>{t("date")}</span><input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /></label>
            <label><span>{t("timeOptional")}</span><input type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label>
          </div>
          <label className="repeat-toggle"><input type="checkbox" checked={repeatsWeekly} onChange={(event) => setRepeatsWeekly(event.target.checked)} /><span><strong>{t("repeatEveryWeek")}</strong><small>{t("repeatHelp")}</small></span></label>
          <label><span>{t("noteOptional")}</span><textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("scheduleNotePlaceholder")} /></label>
          <button className="primary-button" type="submit" disabled={busy || !title.trim()}>{busy ? t("saving") : item ? t("saveChanges") : t("addToTimetable")}</button>
          {onDelete ? <button className="danger-button" type="button" disabled={busy} onClick={() => { if (confirmingDelete) void onDelete(); else setConfirmingDelete(true); }}>{confirmingDelete ? t("tapAgainDelete") : t("deleteTimetable")}</button> : null}
        </form>
      </section>
    </div>
  );
}

function DayInsights({ events }: { events: BabyEvent[] }) {
  const { locale, t } = useI18n();
  const milkRows = events.filter((event) => event.event_type === "milk" && event.amount_ml != null);
  const totalMilk = sumMilk(events);
  const averageMilk = milkRows.length ? Math.round(totalMilk / milkRows.length) : null;
  const wetDiapers = events.filter((event) => event.event_type === "diaper" && (event.diaper_type === "wee" || event.diaper_type === "both")).length;
  const pooDiapers = events.filter((event) => event.event_type === "diaper" && (event.diaper_type === "poo" || event.diaper_type === "both")).length;
  const chronological = [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const activeSpan = chronological.length > 1 ? `${formatTime(chronological[0].occurred_at, locale)}–${formatTime(chronological.at(-1)!.occurred_at, locale)}` : chronological.length ? formatTime(chronological[0].occurred_at, locale) : "—";
  return (
    <div className="insight-grid" aria-label={t("dailyInsights")}>
      <article><span>{t("milkTotal")}</span><strong>{totalMilk} ml</strong><small>{t("bottlesRecorded", { count: milkRows.length })}</small></article>
      <article><span>{t("averageBottle")}</span><strong>{averageMilk == null ? "—" : `${averageMilk} ml`}</strong><small>{t("recordedAmount")}</small></article>
      <article><span>{t("diapers")}</span><strong>{t("diaperBreakdown", { wet: wetDiapers, poo: pooDiapers })}</strong><small>{t("bothCounts")}</small></article>
      <article><span>{t("recordedSpan")}</span><strong>{activeSpan}</strong><small>{t("firstToLast")}</small></article>
    </div>
  );
}

function GrowthView({
  dateOfBirth,
  measurements,
  busy,
  onAdd,
  onDelete,
}: {
  dateOfBirth: string;
  measurements: Measurement[];
  busy: boolean;
  onAdd: (draft: MeasurementDraft) => Promise<void>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const { language, locale, t } = useI18n();
  const [measurementType, setMeasurementType] = useState<"weight" | "height" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [date, setDate] = useState(() => toDateTimeLocal());
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const newestFirst = [...measurements].sort(sortMeasurements);
  const weightRows = newestFirst.filter((item) => item.weight_kg != null);
  const heightRows = newestFirst.filter((item) => item.height_cm != null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!measurementType) return;
    const heightValue = measurementType === "height" && height ? Number(height) : null;
    const weightValue = measurementType === "weight" && weight ? Number(weight) : null;
    if (heightValue == null && weightValue == null) return;
    await onAdd({ measured_at: fromDateTimeLocal(date), height_cm: heightValue, weight_kg: weightValue, note });
    setHeight("");
    setWeight("");
    setNote("");
    setDate(toDateTimeLocal());
    setMeasurementType(null);
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    if (await onDelete(id)) setConfirmDeleteId(null);
    setDeletingId(null);
  }

  return (
    <section>
      <div className="section-title">
        <div><p className="eyebrow">{t("growth")}</p><h2>{t("heightAndWeight")}</h2></div>
        <div className="growth-actions">
          <button className="small-action" type="button" onClick={() => setMeasurementType("weight")}>+ {t("weight")}</button>
          <button className="small-action" type="button" onClick={() => setMeasurementType("height")}>+ {t("height")}</button>
        </div>
      </div>

      {measurementType ? (
        <form className="panel form-grid" onSubmit={submit}>
          <div className="form-heading full-field"><strong>{t("addMeasurement", { type: t(measurementType) })}</strong><button type="button" onClick={() => setMeasurementType(null)}>{t("cancel")}</button></div>
          <label className="full-field"><span>{t("dateAndTime")}</span><input type="datetime-local" value={date} max={toDateTimeLocal()} onChange={(event) => setDate(event.target.value)} required /></label>
          {measurementType === "weight" ? <label className="full-field"><span>{t("weightKg")}</span><input inputMode="decimal" type="number" min="0.1" max="200" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="8.20" required autoFocus /></label> : null}
          {measurementType === "height" ? <label className="full-field"><span>{t("heightCm")}</span><input inputMode="decimal" type="number" min="20" max="200" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="70.1" required autoFocus /></label> : null}
          <label className="full-field"><span>{t("noteOptional")}</span><input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder={t("measuredAtHome")} /></label>
          <button className="primary-button full-field" type="submit" disabled={busy || (measurementType === "height" ? !height : !weight)}>{busy ? t("saving") : t("saveMeasurement", { type: t(measurementType) })}</button>
        </form>
      ) : null}

      <div className="growth-cards">
        <MetricCard label={t("latestWeight")} value={weightRows[0]?.weight_kg != null ? `${weightRows[0].weight_kg.toFixed(2)} kg` : "—"} change={metricChange(weightRows[0]?.weight_kg, weightRows[1]?.weight_kg, "kg", 2, language)} />
        <MetricCard label={t("latestHeight")} value={heightRows[0]?.height_cm != null ? `${heightRows[0].height_cm.toFixed(1)} cm` : "—"} change={metricChange(heightRows[0]?.height_cm, heightRows[1]?.height_cm, "cm", 1, language)} />
      </div>

      {measurements.length ? (
        <section className="growth-curves" aria-label={t("growthCurves")}>
          <div className="growth-section-heading"><p className="eyebrow">{t("trend")}</p><h3>{t("growthCurves")}</h3></div>
          <p className="who-standard-label">{t("whoStandardGirls")}</p>
          <div className="growth-curve-grid">
            {weightRows.length ? <GrowthCurve dateOfBirth={dateOfBirth} rows={[...weightRows].reverse()} metric="weight" label={t("weight")} unit="kg" digits={2} /> : null}
            {heightRows.length ? <GrowthCurve dateOfBirth={dateOfBirth} rows={[...heightRows].reverse()} metric="height" label={t("lengthHeight")} unit="cm" digits={1} /> : null}
          </div>
          <p className="who-growth-note">{t("whoGrowthNote")}</p>
        </section>
      ) : null}

      {newestFirst.length ? (
        <section className="panel growth-table-panel" aria-label={t("growthHistory")}>
          <div className="growth-section-heading"><p className="eyebrow">{t("growthHistory")}</p><h3>{t("measurements")}</h3></div>
          <div className="growth-table-scroll">
            <table className="growth-table">
              <thead><tr><th>{t("date")}</th><th>{t("weight")}</th><th>{t("height")}</th><th><span className="sr-only">{t("delete")}</span></th></tr></thead>
              <tbody>
                {newestFirst.map((item) => {
                  const dateLabel = formatShortDate(item.measured_at, locale);
                  const weightPercentile = item.weight_kg == null ? null : formatWhoPercentile(whoPercentile("weight", dateOfBirth, item.measured_at, item.weight_kg));
                  const heightPercentile = item.height_cm == null ? null : formatWhoPercentile(whoPercentile("height", dateOfBirth, item.measured_at, item.height_cm));
                  const confirming = confirmDeleteId === item.id;
                  const deleting = deletingId === item.id;
                  return (
                    <tr key={item.id}>
                      <td className="growth-date"><strong>{dateLabel}</strong><small>{formatTime(item.measured_at, locale)}</small></td>
                      <td>{item.weight_kg != null ? <><strong>{item.weight_kg.toFixed(2)} kg</strong>{weightPercentile ? <small className="who-percentile">{t("whoPercentile", { percent: weightPercentile })}</small> : null}</> : "—"}</td>
                      <td>{item.height_cm != null ? <><strong>{item.height_cm.toFixed(1)} cm</strong>{heightPercentile ? <small className="who-percentile">{t("whoPercentile", { percent: heightPercentile })}</small> : null}</> : "—"}</td>
                      <td><button className={`measurement-delete ${confirming ? "confirm" : ""}`} type="button" disabled={busy || deleting} aria-label={confirming ? t("confirmDeleteMeasurement", { date: dateLabel }) : t("deleteMeasurement", { date: dateLabel })} onClick={() => void handleDelete(item.id)}>{deleting ? t("deleting") : confirming ? t("confirm") : t("delete")}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState text={t("noMeasurements")} />
      )}
    </section>
  );
}

function SettingsView({
  profile,
  configured,
  busy,
  isOnline,
  realtimeStatus,
  onSave,
  onSignOut,
}: {
  profile: BabyProfile;
  configured: boolean;
  busy: boolean;
  isOnline: boolean;
  realtimeStatus: "connecting" | "connected" | "offline";
  onSave: (profile: BabyProfile) => Promise<boolean>;
  onSignOut?: () => void;
}) {
  const { locale, t } = useI18n();
  const [draft, setDraft] = useState(profile);
  const [editing, setEditing] = useState(false);
  const connectionState = !isOnline ? "offline" : realtimeStatus === "connected" ? "online" : "syncing";
  const birthDetails = [
    profile.birth_time ? `${t("birthTime")}: ${formatScheduleTime(profile.birth_time, locale, "")}` : null,
    profile.birth_weight_kg != null ? `${t("birthWeightKg")}: ${profile.birth_weight_kg.toFixed(3)} kg` : null,
    profile.blood_type ? `${t("bloodType")}: ${profile.blood_type}` : null,
    profile.gestational_weeks != null ? t("gestationalSummary", { weeks: profile.gestational_weeks, days: profile.gestational_days ?? 0 }) : null,
  ].filter(Boolean).join(" · ");

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    if (await onSave(draft)) setEditing(false);
  }

  return (
    <section>
      <div className="section-title"><div><p className="eyebrow">{t("settings")}</p><h2>{t("babyProfile")}</h2></div></div>
      <div className="panel connection-setting">
        <div className={`status-pill ${connectionState === "online" ? "live" : ""}`}><span className="status-dot" />{t(connectionState)}</div>
        <div><strong>{t("connectionStatus")}</strong><span>{t(isOnline ? "onlineDescription" : "offlineDescription")}</span></div>
      </div>
      <div className="panel language-setting"><LanguageSelect /></div>
      {editing ? (
        <form className="panel settings-form" onSubmit={(event) => void submitProfile(event)}>
          <div className="form-heading"><strong>{t("editProfile")}</strong><button type="button" onClick={() => { setDraft(profile); setEditing(false); }}>{t("cancel")}</button></div>
          <label><span>{t("name")}</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
          <div className="form-grid profile-field-grid">
            <label><span>{t("dateOfBirth")}</span><input type="date" value={draft.date_of_birth} max={dateKey(new Date())} onChange={(event) => setDraft({ ...draft, date_of_birth: event.target.value })} required /></label>
            <label><span>{t("birthTime")}</span><input type="time" value={draft.birth_time?.slice(0, 5) ?? ""} onChange={(event) => setDraft({ ...draft, birth_time: event.target.value || null })} /></label>
            <label><span>{t("bloodType")}</span><select value={draft.blood_type ?? ""} onChange={(event) => setDraft({ ...draft, blood_type: event.target.value ? event.target.value as BloodType : null })}><option value="">{t("notSpecified")}</option>{BLOOD_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
            <label><span>{t("birthWeightKg")}</span><input inputMode="decimal" type="number" min="0.2" max="10" step="0.001" value={draft.birth_weight_kg ?? ""} onChange={(event) => setDraft({ ...draft, birth_weight_kg: event.target.value ? Number(event.target.value) : null })} placeholder="3.200" /></label>
          </div>
          <fieldset className="gestational-fields"><legend>{t("gestationalAge")}</legend><div className="form-grid profile-field-grid"><label><span>{t("completedWeeks")}</span><input inputMode="numeric" type="number" min="20" max="45" step="1" value={draft.gestational_weeks ?? ""} onChange={(event) => setDraft({ ...draft, gestational_weeks: event.target.value ? Number(event.target.value) : null, gestational_days: event.target.value ? draft.gestational_days : null })} placeholder="39" /></label><label><span>{t("extraDays")}</span><input inputMode="numeric" type="number" min="0" max="6" step="1" value={draft.gestational_days ?? ""} disabled={draft.gestational_weeks == null} onChange={(event) => setDraft({ ...draft, gestational_days: event.target.value ? Number(event.target.value) : null })} placeholder="0" /></label></div></fieldset>
          <label><span>{t("timeZone")}</span><select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option value="Asia/Hong_Kong">{t("hongKong")}</option></select></label>
          <button className="primary-button" type="submit" disabled={busy || !draft.name.trim()}>{busy ? t("saving") : t("saveProfile")}</button>
        </form>
      ) : (
        <div className="panel profile-summary">
          <div><span>{t("profileSaved")}</span><strong>{profile.name}</strong><small>{t("girl")} · {t("born", { date: formatShortDate(profile.date_of_birth, locale) })} · {t("hongKong")}</small>{birthDetails ? <small className="profile-birth-details">{birthDetails}</small> : null}</div>
          <button className="small-action" type="button" onClick={() => { setDraft(profile); setEditing(true); }}>{t("edit")}</button>
        </div>
      )}

      {!configured ? <div className="setup-note"><strong>{t("demoMode")}</strong><p>{t("demoDescription")}</p></div> : null}
      {configured ? <p className="account-line">{t("pinActive")}</p> : null}
      {onSignOut ? <button className="secondary-button full-width" type="button" onClick={onSignOut}>{t("lockDevice")}</button> : null}
    </section>
  );
}

function OfflineNotice({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="offline-dialog" role="alertdialog" aria-modal="true" aria-labelledby="offline-dialog-title">
        <div className="offline-dialog-icon" aria-hidden="true">☁︎</div>
        <h2 id="offline-dialog-title">{t("internetRequired")}</h2>
        <p>{t("internetRequiredDescription")}</p>
        <button className="primary-button" type="button" onClick={onClose} autoFocus>{t("okay")}</button>
      </section>
    </div>
  );
}

function PinScreen() {
  const { language, t } = useI18n();
  const supabase = getSupabaseBrowserClient();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const result = await unlockHousehold(supabase, pin);
    setMessage(result && language === "zh-Hant" ? localizePinError(result) : result);
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <div className="pin-language"><LanguageSelect compact /></div>
      <div className="login-icon">👶🏻</div>
      <p className="eyebrow">{t("privateTracker")}</p>
      <h1>{t("enterPin")}</h1>
      <p>{t("pinDescription")}</p>
      <form className="login-form" onSubmit={submit}>
        <label><span>{t("fourDigitPin")}</span><input className="pin-input" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="current-password" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required autoFocus /></label>
        {message ? <div className="form-error" role="alert">{message}</div> : null}
        <button className="primary-button" type="submit" disabled={busy || pin.length !== 4}>{busy ? t("opening") : t("openRecords")}</button>
      </form>
    </main>
  );
}

function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className={`language-select ${compact ? "compact" : ""}`}>
      <span>{t("language")}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value as "en" | "zh-Hant")} aria-label={t("language")}>
        <option value="en">{t("english")}</option>
        <option value="zh-Hant">{t("traditionalChinese")}</option>
      </select>
    </label>
  );
}

function localizePinError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("too many") || normalized.includes("wait") || normalized.includes("rate")) {
    return "嘗試次數過多，請稍後再試。";
  }
  if (normalized.includes("pin") || normalized.includes("invalid") || normalized.includes("incorrect")) {
    return "PIN 不正確，請再試一次。";
  }
  return "無法開啟 Harper 的記錄，請稍後再試。";
}

function QuickEventEditor({ type, busy, onClose, onSave }: { type: EventType; busy: boolean; onClose: () => void; onSave: (draft: EventDraft) => Promise<void> }) {
  const { t } = useI18n();
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocal());
  const [milkType, setMilkType] = useState<MilkType>("formula");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [diaperType, setDiaperType] = useState<DiaperType | null>(null);
  const [pooLevel, setPooLevel] = useState<number | null>(null);
  const meta = EVENT_META[type];
  const diaperNeedsPooLevel = diaperType === "poo" || diaperType === "both";
  const valid = type === "milk"
    ? Number(amount) > 0
    : type === "food"
      ? Boolean(note.trim())
      : type === "diaper"
        ? diaperType != null && (!diaperNeedsPooLevel || pooLevel != null)
        : true;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-event-title">
        <div className="sheet-handle" />
        <div className="sheet-title"><div className={`event-icon ${meta.color}`}>{meta.emoji}</div><div><p className="eyebrow">{t("newRecord")}</p><h2 id="quick-event-title">{t(meta.labelKey)}</h2></div><button type="button" onClick={onClose} aria-label={t("close")}>×</button></div>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          void onSave({
            event_type: type,
            occurred_at: fromDateTimeLocal(occurredAt),
            milk_type: type === "milk" ? milkType : null,
            amount_ml: type === "milk" ? Number(amount) : null,
            diaper_type: type === "diaper" ? diaperType : null,
            poo_level: type === "diaper" && diaperNeedsPooLevel ? pooLevel : null,
            note: note.trim() || null,
          });
        }}>
          {type === "milk" ? <>
            <fieldset className="amount-picker"><legend>{t("quickAmount")}</legend><div>{[60, 90, 120, 150, 180, 210].map((value) => <button className={amount === String(value) ? "selected" : ""} type="button" key={value} onClick={() => setAmount(String(value))} aria-pressed={amount === String(value)}>{value}<small>ml</small></button>)}</div></fieldset>
            <label><span>{t("amountMl")}</span><input inputMode="numeric" type="number" min="1" max="2000" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={t("anotherAmount")} required /></label>
            <label><span>{t("milkType")}</span><select value={milkType} onChange={(event) => setMilkType(event.target.value as MilkType)}><option value="formula">{t("formula")}</option><option value="cow_milk">{t("cowsMilk")}</option></select></label>
          </> : null}
          {type === "food" ? <label><span>{t("whatAte")}</span><textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("foodPlaceholder")} required autoFocus /></label> : null}
          {type === "diaper" ? <DiaperTypePicker value={diaperType} onChange={(value) => { setDiaperType(value); if (value === "wee") setPooLevel(null); }} /> : null}
          {type === "diaper" && diaperNeedsPooLevel ? <PooLevelPicker value={pooLevel} onChange={setPooLevel} /> : null}
          {type !== "food" ? <>
            <button className="optional-toggle" type="button" aria-expanded={showNote} onClick={() => setShowNote((current) => !current)}>{showNote ? t("hideNote") : t("addNote")}</button>
            {showNote ? <label><span>{t("noteOptional")}</span><textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("optionalNote")} autoFocus /></label> : null}
          </> : null}
          <label><span>{t("dateAndTime")}</span><input type="datetime-local" value={occurredAt} max={toDateTimeLocal()} onChange={(event) => setOccurredAt(event.target.value)} required /></label>
          <button className="primary-button" type="submit" disabled={busy || !valid}>{busy ? t("saving") : t("saveEvent", { type: t(meta.labelKey) })}</button>
        </form>
      </section>
    </div>
  );
}

function DiaperTypePicker({ value, onChange }: { value: DiaperType | null; onChange: (value: DiaperType) => void }) {
  const { t } = useI18n();
  const options: Array<{ value: DiaperType; label: string; emoji: string }> = [
    { value: "wee", label: t("wee"), emoji: "💧" },
    { value: "poo", label: t("poo"), emoji: "💩" },
    { value: "both", label: t("both"), emoji: "💧💩" },
  ];
  return <fieldset className="diaper-picker"><legend>{t("diaperQuestion")}</legend><div>{options.map((option) => <button className={value === option.value ? "selected" : ""} type="button" key={option.value} onClick={() => onChange(option.value)} aria-pressed={value === option.value}><span aria-hidden="true">{option.emoji}</span>{option.label}</button>)}</div></fieldset>;
}

function PooLevelPicker({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  const { t } = useI18n();
  return <fieldset className="poo-picker"><legend>{t("pooLevel")}</legend><div>{[1, 2, 3, 4, 5].map((level) => <button className={value === level ? "selected" : ""} type="button" key={level} onClick={() => onChange(level)} aria-pressed={value === level}>{level}</button>)}</div></fieldset>;
}

function EventEditor({ event, busy, onClose, onSave, onDelete }: { event: BabyEvent; busy: boolean; onClose: () => void; onSave: (event: BabyEvent) => Promise<void>; onDelete: () => void }) {
  const { t } = useI18n();
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocal(event.occurred_at));
  const [milkType, setMilkType] = useState<MilkType | "">(event.milk_type ?? "");
  const [amount, setAmount] = useState(event.amount_ml?.toString() ?? "");
  const [note, setNote] = useState(event.note ?? "");
  const [diaperType, setDiaperType] = useState<DiaperType | null>(event.diaper_type ?? null);
  const [pooLevel, setPooLevel] = useState<number | null>(event.poo_level ?? null);
  const meta = EVENT_META[event.event_type];
  const diaperNeedsPooLevel = diaperType === "poo" || diaperType === "both";
  const valid = event.event_type === "milk"
    ? Number(amount) > 0
    : event.event_type === "food"
      ? Boolean(note.trim())
      : event.event_type === "diaper"
        ? diaperType != null && (!diaperNeedsPooLevel || pooLevel != null)
        : true;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) onClose(); }}>
      <section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-event-title">
        <div className="sheet-handle" />
        <div className="sheet-title"><div className={`event-icon ${meta.color}`}>{meta.emoji}</div><div><p className="eyebrow">{t("editRecord")}</p><h2 id="edit-event-title">{t(meta.labelKey)}</h2></div><button type="button" onClick={onClose} aria-label={t("close")}>×</button></div>
        <form onSubmit={(formEvent) => {
          formEvent.preventDefault();
          void onSave({
            ...event,
            occurred_at: fromDateTimeLocal(occurredAt),
            milk_type: event.event_type === "milk" ? milkType || null : null,
            amount_ml: event.event_type === "milk" && amount ? Number(amount) : null,
            diaper_type: event.event_type === "diaper" ? diaperType : null,
            poo_level: event.event_type === "diaper" && diaperNeedsPooLevel ? pooLevel : null,
            note: note.trim() || null,
          });
        }}>
          <label><span>{t("dateAndTime")}</span><input type="datetime-local" value={occurredAt} max={toDateTimeLocal()} onChange={(changeEvent) => setOccurredAt(changeEvent.target.value)} required /></label>
          {event.event_type === "milk" ? <>
            <label><span>{t("milkType")}</span><select value={milkType} onChange={(changeEvent) => setMilkType(changeEvent.target.value as MilkType | "")}><option value="">{t("notSpecified")}</option><option value="formula">{t("formula")}</option><option value="cow_milk">{t("cowsMilk")}</option></select></label>
            <label><span>{t("amountMl")}</span><input inputMode="numeric" type="number" min="1" max="2000" value={amount} onChange={(changeEvent) => setAmount(changeEvent.target.value)} placeholder="120" required /></label>
          </> : null}
          {event.event_type === "diaper" ? <DiaperTypePicker value={diaperType} onChange={(value) => { setDiaperType(value); if (value === "wee") setPooLevel(null); }} /> : null}
          {event.event_type === "diaper" && diaperNeedsPooLevel ? <PooLevelPicker value={pooLevel} onChange={setPooLevel} /> : null}
          <label><span>{event.event_type === "food" ? t("whatAte") : t("note")}</span><textarea rows={3} maxLength={1000} value={note} onChange={(changeEvent) => setNote(changeEvent.target.value)} placeholder={event.event_type === "food" ? t("foodPlaceholder") : t("optionalNote")} required={event.event_type === "food"} /></label>
          <button className="primary-button" type="submit" disabled={busy || !valid}>{busy ? t("saving") : t("saveChanges")}</button>
          <button className="danger-button" type="button" disabled={busy} onClick={onDelete}>{t("deleteRecord")}</button>
        </form>
      </section>
    </div>
  );
}

function SummaryCounts({ events }: { events: BabyEvent[] }) {
  const { t } = useI18n();
  const counts = events.reduce<Record<EventType, number>>((result, event) => {
    result[event.event_type] += 1;
    return result;
  }, { milk: 0, food: 0, diaper: 0, shower: 0 });
  return <div className="summary-strip">{(Object.keys(EVENT_META) as EventType[]).map((type) => <div key={type}><span>{EVENT_META[type].emoji}</span><strong>{counts[type]}</strong><small>{t(EVENT_META[type].labelKey)}</small></div>)}</div>;
}

function EventList({ events, onEdit, onDelete, empty }: { events: BabyEvent[]; onEdit: (event: BabyEvent) => void; onDelete: (id: string) => Promise<void>; empty: string }) {
  const { locale, t } = useI18n();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  if (!events.length) return <EmptyState text={empty} />;
  return <div className="event-list">{events.map((event) => {
    const meta = EVENT_META[event.event_type];
    const label = t(meta.labelKey);
    const eventTime = formatTime(event.occurred_at, locale);
    const details = [event.amount_ml ? `${event.amount_ml} ml` : null, event.milk_type ? milkTypeLabel(event.milk_type, t) : null, event.diaper_type ? diaperTypeLabel(event.diaper_type, t) : null, event.poo_level ? t("level", { level: event.poo_level }) : null, event.note].filter(Boolean).join(" · ");
    const confirming = confirmDeleteId === event.id;
    const deleting = deletingId === event.id;
    return <div className="event-row" key={event.id}><button className="event-main" type="button" onClick={() => onEdit(event)}><span className={`event-icon ${meta.color}`}>{meta.emoji}</span><span className="event-copy"><strong>{label}</strong><small>{details || t("tapDetails")}</small></span><time>{eventTime}</time><span className="chevron">›</span></button><button className={`quick-delete ${confirming ? "confirm" : ""}`} type="button" disabled={deleting} aria-label={confirming ? t("confirmDelete", { type: label }) : t("deleteAt", { type: label, time: eventTime })} onClick={() => void handleDelete(event.id)}>{deleting ? t("deleting") : confirming ? t("confirm") : t("delete")}</button></div>;
  })}</div>;
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} type="button" onClick={onClick} aria-current={active ? "page" : undefined}><span>{icon}</span><small>{label}</small></button>;
}

function MetricCard({ label, value, change }: { label: string; value: string; change: string | null }) {
  const { t } = useI18n();
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{change ?? t("noPreviousMeasurement")}</small></article>;
}

function GrowthCurve({
  dateOfBirth,
  rows,
  metric,
  label,
  unit,
  digits,
}: {
  dateOfBirth: string;
  rows: Measurement[];
  metric: WhoGrowthMetric;
  label: string;
  unit: string;
  digits: number;
}) {
  const { t } = useI18n();
  const field = metric === "weight" ? "weight_kg" : "height_cm";
  const measurements = rows.flatMap((row) => {
    const value = row[field];
    const age = ageInMonths(dateOfBirth, row.measured_at);
    return value == null || age < 0 || age > 60 ? [] : [{ value, age, date: row.measured_at }];
  });
  if (!measurements.length) return null;
  const latest = measurements.at(-1)!;
  const chartMaxAge = Math.min(60, Math.max(12, Math.ceil(Math.max(...measurements.map((item) => item.age)) + 3)));
  const ages = Array.from({ length: chartMaxAge + 1 }, (_, month) => month);
  const referenceCurves = WHO_PERCENTILE_CURVES.map((curve) => ({
    ...curve,
    values: ages.flatMap((age) => {
      const value = whoReferenceValue(metric, age, curve.z);
      return value == null ? [] : [{ age, value }];
    }),
  }));
  const allValues = [...measurements.map((item) => item.value), ...referenceCurves.flatMap((curve) => curve.values.map((item) => item.value))];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const padding = (rawMax - rawMin || 1) * 0.08;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const xFor = (age: number) => 16 + (age / chartMaxAge) * 276;
  const yFor = (value: number) => 106 - ((value - min) / (max - min)) * 86;
  const measurementCoordinates = measurements.map((item) => ({ x: xFor(item.age), y: yFor(item.value) }));
  const measurementPoints = measurementCoordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const color = metric === "weight" ? "#d86f59" : "#4f8ca7";
  const latestPercentile = formatWhoPercentile(whoPercentile(metric, dateOfBirth, latest.date, latest.value));
  return (
    <article className="panel growth-curve-card">
      <div className="growth-curve-heading"><span>{label}</span><div><strong>{latest.value.toFixed(digits)} {unit}</strong>{latestPercentile ? <small>{t("whoPercentile", { percent: latestPercentile })}</small> : null}</div></div>
      <svg className="growth-curve" viewBox="0 0 320 120" role="img" aria-label={`${label}: ${latestPercentile ? t("whoPercentile", { percent: latestPercentile }) : latest.value}`}>
        {[20, 63, 106].map((y) => <line key={y} x1="16" x2="292" y1={y} y2={y} stroke="#eee5df" strokeWidth="1" />)}
        {referenceCurves.map((curve) => {
          const referencePoints = curve.values.map((item) => `${xFor(item.age)},${yFor(item.value)}`).join(" ");
          const last = curve.values.at(-1);
          return <g key={curve.percentile}><polyline points={referencePoints} fill="none" stroke={curve.percentile === 50 ? "#9f8a80" : "#c9bbb4"} strokeWidth={curve.percentile === 50 ? "1.8" : "1.1"} strokeDasharray={curve.percentile === 50 ? undefined : "3 3"} /><text x="297" y={(last ? yFor(last.value) : 0) + 3} fill="#8c7a72" fontSize="7" fontWeight="700">{curve.percentile}%</text></g>;
        })}
        {measurements.length > 1 ? <polyline points={measurementPoints} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {measurementCoordinates.map(({ x, y }, index) => <circle key={`${measurements[index].date}-${measurements[index].value}`} cx={x} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="3" />)}
      </svg>
      <div className="growth-curve-footer"><span>{t("monthsShort", { count: 0 })}</span><span>{t("monthsShort", { count: chartMaxAge })}</span></div>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span>♡</span><p>{text}</p></div>;
}

function LoadingScreen({ label }: { label?: string }) {
  const { t } = useI18n();
  return <main className="loading-screen"><div className="loading-bubble">♡</div><p>{label ?? t("loadingRecords")}</p></main>;
}

function sortNewest(a: BabyEvent, b: BabyEvent) {
  return Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
}

function milkTypeLabel(type: MilkType, t: (key: TranslationKey) => string) {
  if (type === "cow_milk") return t("cowsMilk");
  if (type === "formula") return t("formula");
  if (type === "breast_milk") return t("breastMilk");
  return t("breastfeeding");
}

function diaperTypeLabel(type: DiaperType, t: (key: TranslationKey) => string) {
  if (type === "both") return t("pooAndWee");
  return type === "poo" ? t("poo") : t("wee");
}

function sortMeasurements(a: Measurement, b: Measurement) {
  return Date.parse(b.measured_at) - Date.parse(a.measured_at);
}

function sortScheduleItems(a: ScheduleItem, b: ScheduleItem) {
  const dateDifference = a.event_date.localeCompare(b.event_date);
  if (dateDifference) return dateDifference;
  return (a.event_time ?? "").localeCompare(b.event_time ?? "");
}

function scheduleOccursOn(item: ScheduleItem, date: string) {
  if (!item.repeats_weekly) return item.event_date === date;
  if (item.event_date > date) return false;
  return new Date(`${item.event_date}T12:00:00`).getDay() === new Date(`${date}T12:00:00`).getDay();
}

function sumMilk(events: BabyEvent[]) {
  return events.reduce((total, event) => total + (event.event_type === "milk" ? event.amount_ml ?? 0 : 0), 0);
}

function formatWeekday(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

function formatWeekHeading(dates: string[], locale: string) {
  const first = new Date(`${dates[0]}T12:00:00`);
  const last = new Date(`${dates.at(-1)}T12:00:00`);
  const firstLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(first);
  const lastLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(last);
  return `${firstLabel} – ${lastLabel}`;
}

function upsertById<T extends { id: string }>(current: T[], changed: T, sort: (a: T, b: T) => number) {
  return [changed, ...current.filter((item) => item.id !== changed.id)].sort(sort);
}

function formatCurrentTime(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatCurrentDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function metricChange(current: number | null | undefined, previous: number | null | undefined, unit: string, digits: number, language: "en" | "zh-Hant" = "en"): string | null {
  if (current == null || previous == null) return null;
  const difference = current - previous;
  const sign = difference > 0 ? "+" : "";
  return language === "zh-Hant"
    ? `自上次起 ${sign}${difference.toFixed(digits)} ${unit}`
    : `${sign}${difference.toFixed(digits)} ${unit} since last time`;
}
