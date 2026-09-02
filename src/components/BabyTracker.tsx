"use client";

import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ageLabel,
  dateKey,
  elapsedLabel,
  formatDayHeading,
  formatShortDate,
  formatTime,
  fromDateTimeLocal,
  shiftDate,
  toDateTimeLocal,
} from "@/src/lib/date";
import { unlockHousehold } from "@/src/lib/household-auth";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/src/lib/supabase-browser";
import type {
  BabyEvent,
  BabyProfile,
  DiaperType,
  EventDraft,
  EventType,
  Measurement,
  MeasurementDraft,
  MilkType,
} from "@/src/lib/types";

type Tab = "today" | "history" | "growth" | "settings";

const EVENT_META: Record<EventType, { emoji: string; label: string; color: string }> = {
  milk: { emoji: "🍼", label: "Milk", color: "peach" },
  food: { emoji: "🥣", label: "Food", color: "sun" },
  diaper: { emoji: "🧷", label: "Diaper", color: "sage" },
  shower: { emoji: "🚿", label: "Shower", color: "sky" },
};

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

export function BabyTracker() {
  const configured = hasSupabaseConfig();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(!configured);
  const [profile, setProfile] = useState<BabyProfile | null>(null);
  const [events, setEvents] = useState<BabyEvent[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [editingEvent, setEditingEvent] = useState<BabyEvent | null>(null);
  const [quickEventType, setQuickEventType] = useState<EventType | null>(null);
  const [toast, setToast] = useState<{ event: BabyEvent; message: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const profileId = profile?.id;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
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
        };
        setProfile(parsed.profile.name === "Baby Girl" ? { ...parsed.profile, name: "Harper" } : parsed.profile);
        setEvents([...parsed.events].sort(sortNewest));
        setMeasurements([...parsed.measurements].sort(sortMeasurements));
      } else {
        setProfile(makeDemoProfile());
        setEvents(makeDemoEvents());
        setMeasurements(makeDemoMeasurements());
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

    const [eventResult, measurementResult] = await Promise.all([
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
    ]);

    if (eventResult.error || measurementResult.error) {
      setError(eventResult.error?.message ?? measurementResult.error?.message ?? "Unable to load records.");
      setLoading(false);
      return;
    }

    setProfile(baby);
    setEvents(eventResult.data as BabyEvent[]);
    setMeasurements(measurementResult.data as Measurement[]);
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
      JSON.stringify({ profile, events, measurements }),
    );
  }, [configured, events, loading, measurements, profile]);

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
        { event: "UPDATE", schema: "public", table: "babies", filter: `id=eq.${profileId}` },
        (payload) => setProfile(payload.new as BabyProfile),
      )
      .on("broadcast", { event: "event_deleted" }, ({ payload }) => {
        const id = typeof payload?.id === "string" ? payload.id : null;
        if (id) setEvents((current) => current.filter((item) => item.id !== id));
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

  async function addEvent(draft: EventDraft): Promise<BabyEvent | null> {
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
    if (type !== "shower") {
      setQuickEventType(type);
      return;
    }
    const saved = await addEvent({ event_type: type, occurred_at: new Date().toISOString() });
    if (saved) {
      setToast({ event: saved, message: `${EVENT_META[type].label} saved at ${formatTime(saved.occurred_at)}` });
    }
  }

  async function saveQuickEvent(draft: EventDraft) {
    const saved = await addEvent(draft);
    if (!saved) return;
    setQuickEventType(null);
    setToast({ event: saved, message: `${EVENT_META[saved.event_type].label} saved at ${formatTime(saved.occurred_at)}` });
  }

  async function updateEvent(event: BabyEvent) {
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

  async function saveProfile(next: BabyProfile): Promise<boolean> {
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
  if (!profile) return <LoadingScreen label="Preparing her profile…" />;

  const today = dateKey(new Date());
  const todayEvents = events.filter((event) => dateKey(event.occurred_at) === today);
  const selectedEvents = events.filter((event) => dateKey(event.occurred_at) === selectedDate);
  const latestMilk = events.find((event) => event.event_type === "milk");
  const latestFood = events.find((event) => event.event_type === "food");

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Baby record</p>
          <div className="hero-name-row">
            <h1>{profile.name}</h1>
            <time className="current-time" dateTime={now.toISOString()}>{formatCurrentTime(now)}</time>
          </div>
          <p className="baby-age">{formatCurrentDate(now)} · Girl · {ageLabel(profile.date_of_birth)}</p>
        </div>
        <div className={`status-pill ${realtimeStatus === "connected" ? "live" : ""}`}>
          <span className="status-dot" />
          {realtimeStatus === "connected" ? "Live" : realtimeStatus === "connecting" ? "Syncing" : "Offline"}
        </div>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
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
          <GrowthView measurements={measurements} busy={busy} onAdd={addMeasurement} />
        ) : null}
        {tab === "settings" ? (
          <SettingsView
            profile={profile}
            configured={configured}
            busy={busy}
            onSave={saveProfile}
            onSignOut={configured && supabase ? () => void supabase.auth.signOut({ scope: "local" }) : undefined}
          />
        ) : null}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavButton active={tab === "today"} icon="⌂" label="Today" onClick={() => setTab("today")} />
        <NavButton active={tab === "history"} icon="◫" label="History" onClick={() => setTab("history")} />
        <NavButton active={tab === "growth"} icon="↗" label="Growth" onClick={() => setTab("growth")} />
        <NavButton active={tab === "settings"} icon="⚙" label="Settings" onClick={() => setTab("settings")} />
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

      {toast ? (
        <div className="toast" role="status">
          <div><strong>Saved</strong><span>{toast.message}</span></div>
          <button type="button" onClick={() => void deleteEvent(toast.event.id)}>Undo</button>
          <button type="button" onClick={() => { setEditingEvent(toast.event); setToast(null); }}>Details</button>
          <button className="toast-close" type="button" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
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
}: {
  events: BabyEvent[];
  latestMilk?: BabyEvent;
  latestFood?: BabyEvent;
  busy: boolean;
  onQuickAdd: (type: EventType) => void;
  onEdit: (event: BabyEvent) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <>
      <section className="last-cards" aria-label="Latest feeding">
        <div className="last-card"><span>Last milk</span><strong>{latestMilk ? elapsedLabel(latestMilk.occurred_at) : "No record"}</strong></div>
        <div className="last-card"><span>Last food</span><strong>{latestFood ? elapsedLabel(latestFood.occurred_at) : "No record"}</strong></div>
      </section>

      <section>
        <div className="section-title"><div><p className="eyebrow">Quick record</p><h2>What happened?</h2></div><span>Add the important details</span></div>
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
                <strong>{meta.label}</strong>
                <small>{type === "shower" ? "Record now" : "Add details"}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="timeline-section">
        <div className="section-title"><div><p className="eyebrow">Today</p><h2>{events.length} records</h2></div></div>
        <SummaryCounts events={events} />
        <EventList events={events} onEdit={onEdit} onDelete={onDelete} empty="Nothing recorded today yet." />
      </section>
    </>
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
  const today = dateKey(new Date());
  return (
    <section>
      <div className="section-title"><div><p className="eyebrow">History</p><h2>{formatDayHeading(selectedDate)}</h2></div></div>
      <div className="date-switcher">
        <button type="button" onClick={() => onDateChange(shiftDate(selectedDate, -1))} aria-label="Previous day">‹</button>
        <label>
          <span className="sr-only">Choose date</span>
          <input type="date" value={selectedDate} max={today} onChange={(event) => onDateChange(event.target.value)} />
        </label>
        <button type="button" disabled={selectedDate >= today} onClick={() => onDateChange(shiftDate(selectedDate, 1))} aria-label="Next day">›</button>
      </div>
      <SummaryCounts events={events} />
      <EventList events={events} onEdit={onEdit} onDelete={onDelete} empty="No records for this day." />
    </section>
  );
}

function GrowthView({ measurements, busy, onAdd }: { measurements: Measurement[]; busy: boolean; onAdd: (draft: MeasurementDraft) => Promise<void> }) {
  const [measurementType, setMeasurementType] = useState<"weight" | "height" | null>(null);
  const [date, setDate] = useState(() => toDateTimeLocal());
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const newestFirst = [...measurements].sort(sortMeasurements);
  const weightRows = newestFirst.filter((item) => item.weight_kg != null);
  const heightRows = newestFirst.filter((item) => item.height_cm != null);
  const chronologicalWeights = [...weightRows].reverse();

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

  return (
    <section>
      <div className="section-title">
        <div><p className="eyebrow">Growth</p><h2>Height & weight</h2></div>
        <div className="growth-actions">
          <button className="small-action" type="button" onClick={() => setMeasurementType("weight")}>+ Weight</button>
          <button className="small-action" type="button" onClick={() => setMeasurementType("height")}>+ Height</button>
        </div>
      </div>

      {measurementType ? (
        <form className="panel form-grid" onSubmit={submit}>
          <div className="form-heading full-field"><strong>Add {measurementType}</strong><button type="button" onClick={() => setMeasurementType(null)}>Cancel</button></div>
          <label className="full-field"><span>Date and time</span><input type="datetime-local" value={date} max={toDateTimeLocal()} onChange={(event) => setDate(event.target.value)} required /></label>
          {measurementType === "weight" ? <label className="full-field"><span>Weight (kg)</span><input inputMode="decimal" type="number" min="0.1" max="200" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="8.20" required autoFocus /></label> : null}
          {measurementType === "height" ? <label className="full-field"><span>Height (cm)</span><input inputMode="decimal" type="number" min="20" max="200" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="70.1" required autoFocus /></label> : null}
          <label className="full-field"><span>Note (optional)</span><input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Measured at home" /></label>
          <button className="primary-button full-field" type="submit" disabled={busy || (measurementType === "height" ? !height : !weight)}>Save {measurementType}</button>
        </form>
      ) : null}

      <div className="growth-cards">
        <MetricCard label="Latest weight" value={weightRows[0]?.weight_kg != null ? `${weightRows[0].weight_kg.toFixed(2)} kg` : "—"} change={metricChange(weightRows[0]?.weight_kg, weightRows[1]?.weight_kg, "kg", 2)} />
        <MetricCard label="Latest height" value={heightRows[0]?.height_cm != null ? `${heightRows[0].height_cm.toFixed(1)} cm` : "—"} change={metricChange(heightRows[0]?.height_cm, heightRows[1]?.height_cm, "cm", 1)} />
      </div>

      {weightRows.length > 1 ? (
        <div className="panel chart-panel">
          <div><p className="eyebrow">Trend</p><h3>Weight</h3></div>
          <Sparkline values={chronologicalWeights.map((item) => item.weight_kg).filter((value): value is number => value != null)} />
        </div>
      ) : null}

      <div className="measurement-list">
        {newestFirst.length ? newestFirst.map((item) => (
          <article className="measurement-row" key={item.id}>
            <div><strong>{formatShortDate(item.measured_at)}</strong><span>{formatTime(item.measured_at)}</span></div>
            <div className="measurement-values">
              {item.weight_kg != null ? <span>{item.weight_kg.toFixed(2)} kg</span> : null}
              {item.height_cm != null ? <span>{item.height_cm.toFixed(1)} cm</span> : null}
            </div>
          </article>
        )) : <EmptyState text="Add the first height or weight measurement." />}
      </div>
    </section>
  );
}

function SettingsView({
  profile,
  configured,
  busy,
  onSave,
  onSignOut,
}: {
  profile: BabyProfile;
  configured: boolean;
  busy: boolean;
  onSave: (profile: BabyProfile) => Promise<boolean>;
  onSignOut?: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [editing, setEditing] = useState(false);

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    if (await onSave(draft)) setEditing(false);
  }

  return (
    <section>
      <div className="section-title"><div><p className="eyebrow">Settings</p><h2>Baby profile</h2></div></div>
      {editing ? (
        <form className="panel settings-form" onSubmit={(event) => void submitProfile(event)}>
          <div className="form-heading"><strong>Edit profile</strong><button type="button" onClick={() => { setDraft(profile); setEditing(false); }}>Cancel</button></div>
          <label><span>Name</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
          <label><span>Date of birth</span><input type="date" value={draft.date_of_birth} max={dateKey(new Date())} onChange={(event) => setDraft({ ...draft, date_of_birth: event.target.value })} required /></label>
          <label><span>Time zone</span><select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option value="Asia/Hong_Kong">Hong Kong</option></select></label>
          <button className="primary-button" type="submit" disabled={busy || !draft.name.trim()}>{busy ? "Saving…" : "Save profile"}</button>
        </form>
      ) : (
        <div className="panel profile-summary">
          <div><span>Profile saved</span><strong>{profile.name}</strong><small>Girl · Born {formatShortDate(profile.date_of_birth)} · Hong Kong</small></div>
          <button className="small-action" type="button" onClick={() => { setDraft(profile); setEditing(true); }}>Edit</button>
        </div>
      )}

      <div className="panel chatgpt-card">
        <div className="chatgpt-mark">✦</div>
        <div><p className="eyebrow">ChatGPT access</p><h3>Ask about her records</h3><p>Once connected, ChatGPT can privately read Harper&apos;s records and answer questions. It cannot add, edit, or delete anything.</p><span className="connection-note">{configured ? "Not connected yet · one-time setup remains" : "Connect Supabase before enabling ChatGPT"}</span></div>
      </div>

      {!configured ? <div className="setup-note"><strong>Demo mode</strong><p>Your changes are stored only in this browser. Add the Supabase values from <code>.env.example</code> to enable private cloud storage.</p></div> : null}
      {configured ? <p className="account-line">Household PIN access is active on this device.</p> : null}
      {onSignOut ? <button className="secondary-button full-width" type="button" onClick={onSignOut}>Lock this device</button> : null}
    </section>
  );
}

function PinScreen() {
  const supabase = getSupabaseBrowserClient();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    setMessage(await unlockHousehold(supabase, pin));
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <div className="login-icon">👶🏻</div>
      <p className="eyebrow">Harper&apos;s private tracker</p>
      <h1>Enter household PIN</h1>
      <p>Use the same PIN on each family phone. No account or email is needed.</p>
      <form className="login-form" onSubmit={submit}>
        <label><span>4-digit PIN</span><input className="pin-input" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="current-password" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" required autoFocus /></label>
        {message ? <div className="form-error" role="alert">{message}</div> : null}
        <button className="primary-button" type="submit" disabled={busy || pin.length !== 4}>{busy ? "Opening…" : "Open Harper's records"}</button>
      </form>
    </main>
  );
}

function QuickEventEditor({ type, busy, onClose, onSave }: { type: EventType; busy: boolean; onClose: () => void; onSave: (draft: EventDraft) => Promise<void> }) {
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
        <div className="sheet-title"><div className={`event-icon ${meta.color}`}>{meta.emoji}</div><div><p className="eyebrow">New record</p><h2 id="quick-event-title">{meta.label}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
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
            <fieldset className="amount-picker"><legend>Quick amount</legend><div>{[60, 90, 120, 150, 180, 210].map((value) => <button className={amount === String(value) ? "selected" : ""} type="button" key={value} onClick={() => setAmount(String(value))} aria-pressed={amount === String(value)}>{value}<small>ml</small></button>)}</div></fieldset>
            <label><span>Amount (ml)</span><input inputMode="numeric" type="number" min="1" max="2000" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Enter another amount" required /></label>
            <label><span>Milk type</span><select value={milkType} onChange={(event) => setMilkType(event.target.value as MilkType)}><option value="formula">Formula</option><option value="cow_milk">Cow&apos;s milk</option></select></label>
          </> : null}
          {type === "food" ? <label><span>What did she eat?</span><textarea rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Banana and oatmeal" required autoFocus /></label> : null}
          {type === "diaper" ? <DiaperTypePicker value={diaperType} onChange={(value) => { setDiaperType(value); if (value === "wee") setPooLevel(null); }} /> : null}
          {type === "diaper" && diaperNeedsPooLevel ? <PooLevelPicker value={pooLevel} onChange={setPooLevel} /> : null}
          {type !== "food" ? <>
            <button className="optional-toggle" type="button" aria-expanded={showNote} onClick={() => setShowNote((current) => !current)}>{showNote ? "− Hide note" : "+ Add note (optional)"}</button>
            {showNote ? <label><span>Note (optional)</span><textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" autoFocus /></label> : null}
          </> : null}
          <label><span>Date and time</span><input type="datetime-local" value={occurredAt} max={toDateTimeLocal()} onChange={(event) => setOccurredAt(event.target.value)} required /></label>
          <button className="primary-button" type="submit" disabled={busy || !valid}>{busy ? "Saving…" : `Save ${meta.label.toLowerCase()}`}</button>
        </form>
      </section>
    </div>
  );
}

function DiaperTypePicker({ value, onChange }: { value: DiaperType | null; onChange: (value: DiaperType) => void }) {
  const options: Array<{ value: DiaperType; label: string; emoji: string }> = [
    { value: "wee", label: "Wee", emoji: "💧" },
    { value: "poo", label: "Poo", emoji: "💩" },
    { value: "both", label: "Both", emoji: "💧💩" },
  ];
  return <fieldset className="diaper-picker"><legend>What was in the diaper?</legend><div>{options.map((option) => <button className={value === option.value ? "selected" : ""} type="button" key={option.value} onClick={() => onChange(option.value)} aria-pressed={value === option.value}><span aria-hidden="true">{option.emoji}</span>{option.label}</button>)}</div></fieldset>;
}

function PooLevelPicker({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return <fieldset className="poo-picker"><legend>Poo level · 1 to 5 (5 is most)</legend><div>{[1, 2, 3, 4, 5].map((level) => <button className={value === level ? "selected" : ""} type="button" key={level} onClick={() => onChange(level)} aria-pressed={value === level}>{level}</button>)}</div></fieldset>;
}

function EventEditor({ event, busy, onClose, onSave, onDelete }: { event: BabyEvent; busy: boolean; onClose: () => void; onSave: (event: BabyEvent) => Promise<void>; onDelete: () => void }) {
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
        <div className="sheet-title"><div className={`event-icon ${meta.color}`}>{meta.emoji}</div><div><p className="eyebrow">Edit record</p><h2 id="edit-event-title">{meta.label}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
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
          <label><span>Date and time</span><input type="datetime-local" value={occurredAt} max={toDateTimeLocal()} onChange={(changeEvent) => setOccurredAt(changeEvent.target.value)} required /></label>
          {event.event_type === "milk" ? <>
            <label><span>Milk type</span><select value={milkType} onChange={(changeEvent) => setMilkType(changeEvent.target.value as MilkType | "")}><option value="">Not specified</option><option value="formula">Formula</option><option value="cow_milk">Cow&apos;s milk</option></select></label>
            <label><span>Amount (ml)</span><input inputMode="numeric" type="number" min="1" max="2000" value={amount} onChange={(changeEvent) => setAmount(changeEvent.target.value)} placeholder="120" required /></label>
          </> : null}
          {event.event_type === "diaper" ? <DiaperTypePicker value={diaperType} onChange={(value) => { setDiaperType(value); if (value === "wee") setPooLevel(null); }} /> : null}
          {event.event_type === "diaper" && diaperNeedsPooLevel ? <PooLevelPicker value={pooLevel} onChange={setPooLevel} /> : null}
          <label><span>{event.event_type === "food" ? "What did she eat?" : "Note"}</span><textarea rows={3} maxLength={1000} value={note} onChange={(changeEvent) => setNote(changeEvent.target.value)} placeholder={event.event_type === "food" ? "Banana and oatmeal" : "Optional note"} required={event.event_type === "food"} /></label>
          <button className="primary-button" type="submit" disabled={busy || !valid}>Save changes</button>
          <button className="danger-button" type="button" disabled={busy} onClick={onDelete}>Delete record</button>
        </form>
      </section>
    </div>
  );
}

function SummaryCounts({ events }: { events: BabyEvent[] }) {
  const counts = events.reduce<Record<EventType, number>>((result, event) => {
    result[event.event_type] += 1;
    return result;
  }, { milk: 0, food: 0, diaper: 0, shower: 0 });
  return <div className="summary-strip">{(Object.keys(EVENT_META) as EventType[]).map((type) => <div key={type}><span>{EVENT_META[type].emoji}</span><strong>{counts[type]}</strong><small>{EVENT_META[type].label}</small></div>)}</div>;
}

function EventList({ events, onEdit, onDelete, empty }: { events: BabyEvent[]; onEdit: (event: BabyEvent) => void; onDelete: (id: string) => Promise<void>; empty: string }) {
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
    const details = [event.amount_ml ? `${event.amount_ml} ml` : null, event.milk_type ? milkTypeLabel(event.milk_type) : null, event.diaper_type ? diaperTypeLabel(event.diaper_type) : null, event.poo_level ? `Level ${event.poo_level}/5` : null, event.note].filter(Boolean).join(" · ");
    const confirming = confirmDeleteId === event.id;
    const deleting = deletingId === event.id;
    return <div className="event-row" key={event.id}><button className="event-main" type="button" onClick={() => onEdit(event)}><span className={`event-icon ${meta.color}`}>{meta.emoji}</span><span className="event-copy"><strong>{meta.label}</strong><small>{details || "Tap to add details"}</small></span><time>{formatTime(event.occurred_at)}</time><span className="chevron">›</span></button><button className={`quick-delete ${confirming ? "confirm" : ""}`} type="button" disabled={deleting} aria-label={confirming ? `Confirm delete ${meta.label} record` : `Delete ${meta.label} record at ${formatTime(event.occurred_at)}`} onClick={() => void handleDelete(event.id)}>{deleting ? "Deleting…" : confirming ? "Confirm" : "Delete"}</button></div>;
  })}</div>;
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} type="button" onClick={onClick} aria-current={active ? "page" : undefined}><span>{icon}</span><small>{label}</small></button>;
}

function MetricCard({ label, value, change }: { label: string; value: string; change: string | null }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{change ?? "No previous measurement"}</small></article>;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => `${10 + (index / (values.length - 1)) * 280},${90 - ((value - min) / range) * 70}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 300 110" role="img" aria-label={`Trend from ${values[0]} to ${values.at(-1)}`}><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e88972" stopOpacity=".28"/><stop offset="1" stopColor="#e88972" stopOpacity="0"/></linearGradient></defs><path d={`M ${points.replaceAll(" ", " L ")} L 290 105 L 10 105 Z`} fill="url(#chart-fill)"/><polyline points={points} fill="none" stroke="#d86f59" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{values.map((value, index) => { const [cx, cy] = points.split(" ")[index].split(","); return <circle key={`${value}-${index}`} cx={cx} cy={cy} r="4.5" fill="#fff" stroke="#d86f59" strokeWidth="3"/>; })}</svg>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span>♡</span><p>{text}</p></div>;
}

function LoadingScreen({ label = "Loading her records…" }: { label?: string }) {
  return <main className="loading-screen"><div className="loading-bubble">♡</div><p>{label}</p></main>;
}

function sortNewest(a: BabyEvent, b: BabyEvent) {
  return Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
}

function milkTypeLabel(type: MilkType) {
  if (type === "cow_milk") return "Cow's milk";
  if (type === "formula") return "Formula";
  if (type === "breast_milk") return "Breast milk";
  return "Breastfeeding";
}

function diaperTypeLabel(type: DiaperType) {
  if (type === "both") return "Poo + wee";
  return type === "poo" ? "Poo" : "Wee";
}

function sortMeasurements(a: Measurement, b: Measurement) {
  return Date.parse(b.measured_at) - Date.parse(a.measured_at);
}

function upsertById<T extends { id: string }>(current: T[], changed: T, sort: (a: T, b: T) => number) {
  return [changed, ...current.filter((item) => item.id !== changed.id)].sort(sort);
}

function formatCurrentTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatCurrentDate(date: Date) {
  return new Intl.DateTimeFormat("en-HK", {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function metricChange(current: number | null | undefined, previous: number | null | undefined, unit: string, digits: number): string | null {
  if (current == null || previous == null) return null;
  const difference = current - previous;
  const sign = difference > 0 ? "+" : "";
  return `${sign}${difference.toFixed(digits)} ${unit} since last time`;
}
