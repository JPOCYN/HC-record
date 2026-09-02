export const EVENT_TYPES = ["milk", "food", "diaper", "shower"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type MilkType = "formula" | "cow_milk" | "breast_milk" | "breastfeeding";
export type DiaperType = "wee" | "poo" | "both";
export type ScheduleItemType = "school" | "doctor" | "important";

export interface BabyProfile {
  id: string;
  owner_id: string;
  name: string;
  gender: "female" | "male" | "other" | "unknown";
  date_of_birth: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface BabyEvent {
  id: string;
  baby_id: string;
  created_by: string;
  event_type: EventType;
  occurred_at: string;
  milk_type: MilkType | null;
  amount_ml: number | null;
  diaper_type: DiaperType | null;
  poo_level: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Measurement {
  id: string;
  baby_id: string;
  created_by: string;
  measured_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItem {
  id: string;
  baby_id: string;
  created_by: string;
  item_type: ScheduleItemType;
  title: string;
  event_date: string;
  event_time: string | null;
  repeats_weekly: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventDraft {
  event_type: EventType;
  occurred_at: string;
  milk_type?: MilkType | null;
  amount_ml?: number | null;
  diaper_type?: DiaperType | null;
  poo_level?: number | null;
  note?: string | null;
}

export interface MeasurementDraft {
  measured_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  note?: string | null;
}

export interface ScheduleDraft {
  item_type: ScheduleItemType;
  title: string;
  event_date: string;
  event_time: string | null;
  repeats_weekly: boolean;
  note?: string | null;
}
