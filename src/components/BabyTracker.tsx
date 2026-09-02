"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/src/lib/supabase-browser";
import type {
  BabyEvent,
  BabyProfile,
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
  poo: { emoji: "💩", label: "Poo", color: "sage" },
  wee: { emoji: "💧", label: "Wee", color: "sky" },
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
  const rows: Array<[EventType, number, number | null, string | null]> = [
    ["milk", 42, 120, null],
    ["wee", 104, null, null],
    ["food", 188, null, "Banana and oatmeal"],
    ["poo", 266, null, null],
    ["milk", 338, 100, null],
  ];
  return rows.map(([event_type, minutesAgo, amount_ml, note]) => {
    const stamp = new Date(now - minutesAgo * 60_000).toISOString();
    return {
      id: crypto.randomUUID(),
      baby_id: DEMO_BABY_ID,
      created_by: DEMO_USER_ID,
      event_type,
      occurred_at: stamp,
      milk_type: event_type === "milk" ? "formula" : null,
      amount_ml,
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
  const [toast, setToast] = useState<{ event: BabyEvent; message: string } | null>(null);

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
    const saved = await addEvent({ event_type: type, occurred_at: new Date().toISOString() });
    if (saved) {
      setToast({ event: saved, message: `${EVENT_META[type].label} saved at ${formatTime(saved.occurred_at)}` });
    }
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

  async function saveProfile(next: BabyProfile) {
    setBusy(true);
    setError(null);
    if (!supabase || !session) {
      setProfile(next);
      setBusy(false);
      return;
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
  }

  if (!authChecked) return <LoadingScreen />;
  if (configured && !session) return <LoginScreen />;
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
          <h1>{profile.name}</h1>
          <p className="baby-age">Girl · {ageLabel(profile.date_of_birth)}</p>
        </div>
        <div className={`status-pill ${configured ? "live" : "demo"}`}>
          <span className="status-dot" />
          {configured ? "Live" : "Demo"}
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
          />
        ) : null}
        {tab === "history" ? (
          <HistoryView
            selectedDate={selectedDate}
            events={selectedEvents}
            onDateChange={setSelectedDate}
            onEdit={setEditingEvent}
          />
        ) : null}
        {tab === "growth" ? (
          <GrowthView measurements={measurements} busy={busy} onAdd={addMeasurement} />
        ) : null}
        {tab === "settings" ? (
          <SettingsView
            profile={profile}
            configured={configured}
            email={session?.user.email ?? null}
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
}: {
  events: BabyEvent[];
  latestMilk?: BabyEvent;
  latestFood?: BabyEvent;
  busy: boolean;
  onQuickAdd: (type: EventType) => void;
  onEdit: (event: BabyEvent) => void;
}) {
  return (
    <>
      <section className="last-cards" aria-label="Latest feeding">
        <div className="last-card"><span>Last milk</span><strong>{latestMilk ? elapsedLabel(latestMilk.occurred_at) : "No record"}</strong></div>
        <div className="last-card"><span>Last food</span><strong>{latestFood ? elapsedLabel(latestFood.occurred_at) : "No record"}</strong></div>
      </section>

      <section>
        <div className="section-title"><div><p className="eyebrow">Quick record</p><h2>What happened?</h2></div><span>Tap once to save now</span></div>
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
                <small>Record now</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="timeline-section">
        <div className="section-title"><div><p className="eyebrow">Today</p><h2>{events.length} records</h2></div></div>
        <SummaryCounts events={events} />
        <EventList events={events} onEdit={onEdit} empty="Nothing recorded today yet." />
      </section>
    </>
  );
}

function HistoryView({
  selectedDate,
  events,
  onDateChange,
  onEdit,
}: {
  selectedDate: string;
  events: BabyEvent[];
  onDateChange: (date: string) => void;
  onEdit: (event: BabyEvent) => void;
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
      <EventList events={events} onEdit={onEdit} empty="No records for this day." />
    </section>
  );
}

function GrowthView({ measurements, busy, onAdd }: { measurements: Measurement[]; busy: boolean; onAdd: (draft: MeasurementDraft) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState(() => toDateTimeLocal());
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const newestFirst = [...measurements].sort(sortMeasurements);
  const newest = newestFirst[0];
  const previous = newestFirst[1];
  const chronological = [...newestFirst].reverse();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const heightValue = height ? Number(height) : null;
    const weightValue = weight ? Number(weight) : null;
    if (heightValue === null && weightValue === null) return;
    await onAdd({ measured_at: fromDateTimeLocal(date), height_cm: heightValue, weight_kg: weightValue, note });
    setHeight("");
    setWeight("");
    setNote("");
    setDate(toDateTimeLocal());
    setExpanded(false);
  }

  return (
    <section>
      <div className="section-title"><div><p className="eyebrow">Growth</p><h2>Height & weight</h2></div><button className="small-action" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Cancel" : "+ Add"}</button></div>

      {expanded ? (
        <form className="panel form-grid" onSubmit={submit}>
          <label className="full-field"><span>Date and time</span><input type="datetime-local" value={date} max={toDateTimeLocal()} onChange={(event) => setDate(event.target.value)} required /></label>
          <label><span>Weight (kg)</span><input inputMode="decimal" type="number" min="0.1" max="200" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="8.20" /></label>
          <label><span>Height (cm)</span><input inputMode="decimal" type="number" min="20" max="200" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="70.1" /></label>
          <label className="full-field"><span>Note (optional)</span><input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Measured at home" /></label>
          <button className="primary-button full-field" type="submit" disabled={busy || (!height && !weight)}>Save measurement</button>
        </form>
      ) : null}

      <div className="growth-cards">
        <MetricCard label="Latest weight" value={newest?.weight_kg != null ? `${newest.weight_kg.toFixed(2)} kg` : "—"} change={metricChange(newest?.weight_kg, previous?.weight_kg, "kg", 2)} />
        <MetricCard label="Latest height" value={newest?.height_cm != null ? `${newest.height_cm.toFixed(1)} cm` : "—"} change={metricChange(newest?.height_cm, previous?.height_cm, "cm", 1)} />
      </div>

      {measurements.length > 1 ? (
        <div className="panel chart-panel">
          <div><p className="eyebrow">Trend</p><h3>Weight</h3></div>
          <Sparkline values={chronological.map((item) => item.weight_kg).filter((value): value is number => value != null)} />
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
  email,
  busy,
  onSave,
  onSignOut,
}: {
  profile: BabyProfile;
  configured: boolean;
  email: string | null;
  busy: boolean;
  onSave: (profile: BabyProfile) => Promise<void>;
  onSignOut?: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  return (
    <section>
      <div className="section-title"><div><p className="eyebrow">Settings</p><h2>Baby profile</h2></div></div>
      <form className="panel settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
        <label><span>Name</span><input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
        <label><span>Date of birth</span><input type="date" value={draft.date_of_birth} max={dateKey(new Date())} onChange={(event) => setDraft({ ...draft, date_of_birth: event.target.value })} required /></label>
        <label><span>Time zone</span><select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option value="Asia/Hong_Kong">Hong Kong</option></select></label>
        <button className="primary-button" type="submit" disabled={busy || !draft.name.trim()}>Save profile</button>
      </form>

      <div className="panel chatgpt-card">
        <div className="chatgpt-mark">✦</div>
        <div><p className="eyebrow">ChatGPT access</p><h3>Ask about her records</h3><p>The private MCP endpoint is available at <code>/mcp</code> after deployment. It is read-only and requires your Supabase approval.</p><span className="connection-note">{configured ? "Supabase connected · OAuth setup remains" : "Connect Supabase before enabling ChatGPT"}</span></div>
      </div>

      {!configured ? <div className="setup-note"><strong>Demo mode</strong><p>Your changes are stored only in this browser. Add the Supabase values from <code>.env.example</code> to enable private cloud storage.</p></div> : null}
      {email ? <p className="account-line">Signed in as {email}</p> : null}
      {onSignOut ? <button className="secondary-button full-width" type="button" onClick={onSignOut}>Sign out on this device</button> : null}
    </section>
  );
}

function LoginScreen() {
  const supabase = getSupabaseBrowserClient();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    if (mode === "sign-up") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Check your email, then return here to sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    }
    setBusy(false);
  }

  return (
    <main className="login-shell">
      <div className="login-icon">👶🏻</div>
      <p className="eyebrow">Private baby tracker</p>
      <h1>{mode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
      <p>{mode === "sign-up" ? "Create the private login for Harper&apos;s records." : "Sign in to see and record Harper&apos;s day."}</p>
      <form className="login-form" onSubmit={submit}>
        <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {message ? <div className="form-error" role="alert">{message}</div> : null}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-up" ? "Create private account" : "Sign in"}</button>
        <button className="login-switch" type="button" onClick={() => { setMode((current) => current === "sign-in" ? "sign-up" : "sign-in"); setMessage(null); }}>
          {mode === "sign-up" ? "Already have an account? Sign in" : "First time? Create private account"}
        </button>
      </form>
    </main>
  );
}

function EventEditor({ event, busy, onClose, onSave, onDelete }: { event: BabyEvent; busy: boolean; onClose: () => void; onSave: (event: BabyEvent) => Promise<void>; onDelete: () => void }) {
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocal(event.occurred_at));
  const [milkType, setMilkType] = useState<MilkType | "">(event.milk_type ?? "");
  const [amount, setAmount] = useState(event.amount_ml?.toString() ?? "");
  const [note, setNote] = useState(event.note ?? "");
  const meta = EVENT_META[event.event_type];

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
            note: note.trim() || null,
          });
        }}>
          <label><span>Date and time</span><input type="datetime-local" value={occurredAt} max={toDateTimeLocal()} onChange={(changeEvent) => setOccurredAt(changeEvent.target.value)} required /></label>
          {event.event_type === "milk" ? <>
            <label><span>Milk type</span><select value={milkType} onChange={(changeEvent) => setMilkType(changeEvent.target.value as MilkType | "")}><option value="">Not specified</option><option value="formula">Formula</option><option value="breast_milk">Breast milk</option><option value="breastfeeding">Breastfeeding</option></select></label>
            <label><span>Amount (ml)</span><input inputMode="numeric" type="number" min="1" max="2000" value={amount} onChange={(changeEvent) => setAmount(changeEvent.target.value)} placeholder="120" /></label>
          </> : null}
          <label><span>Note</span><textarea rows={3} maxLength={1000} value={note} onChange={(changeEvent) => setNote(changeEvent.target.value)} placeholder={event.event_type === "food" ? "What did she eat?" : "Optional note"} /></label>
          <button className="primary-button" type="submit" disabled={busy}>Save changes</button>
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
  }, { milk: 0, food: 0, poo: 0, wee: 0 });
  return <div className="summary-strip">{(Object.keys(EVENT_META) as EventType[]).map((type) => <div key={type}><span>{EVENT_META[type].emoji}</span><strong>{counts[type]}</strong><small>{EVENT_META[type].label}</small></div>)}</div>;
}

function EventList({ events, onEdit, empty }: { events: BabyEvent[]; onEdit: (event: BabyEvent) => void; empty: string }) {
  if (!events.length) return <EmptyState text={empty} />;
  return <div className="event-list">{events.map((event) => {
    const meta = EVENT_META[event.event_type];
    const details = [event.amount_ml ? `${event.amount_ml} ml` : null, event.milk_type ? event.milk_type.replace("_", " ") : null, event.note].filter(Boolean).join(" · ");
    return <button className="event-row" type="button" key={event.id} onClick={() => onEdit(event)}><span className={`event-icon ${meta.color}`}>{meta.emoji}</span><span className="event-copy"><strong>{meta.label}</strong><small>{details || "Tap to add details"}</small></span><time>{formatTime(event.occurred_at)}</time><span className="chevron">›</span></button>;
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

function sortMeasurements(a: Measurement, b: Measurement) {
  return Date.parse(b.measured_at) - Date.parse(a.measured_at);
}

function metricChange(current: number | null | undefined, previous: number | null | undefined, unit: string, digits: number): string | null {
  if (current == null || previous == null) return null;
  const difference = current - previous;
  const sign = difference > 0 ? "+" : "";
  return `${sign}${difference.toFixed(digits)} ${unit} since last time`;
}
