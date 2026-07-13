export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface Tether {
  id: string;
  code: string;
  partner_a: string;
  partner_b: string | null;
  created_at: string;
}

/** Instant chat messages (table kept as `letters` for continuity). */
export interface Message {
  id: string;
  tether_id: string;
  sender_id: string;
  body: string;
  unlock_at: string;
  created_at: string;
}

export interface Memory {
  id: string;
  tether_id: string;
  uploader_id: string;
  storage_path: string;
  caption: string | null;
  rotation: number;
  hearted: boolean;
  created_at: string;
}

export interface DailyQuestion {
  id: string;
  tether_id: string;
  prompt: string;
  for_date: string;
  created_at: string;
}

export interface QuestionAnswer {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Token {
  id: string;
  tether_id: string;
  sender_id: string;
  title: string;
  note: string | null;
  redeemed_at: string | null;
  created_at: string;
}

export interface Goal {
  id: string;
  tether_id: string;
  title: string;
  target: number;
  progress: number;
  completed_at: string | null;
  created_at: string;
}

export interface SpaceState {
  tether_id: string;
  mood: string;
  updated_by: string | null;
  updated_at: string;
}

export interface TetherCore {
  tether_id: string;
  heat_level: number;
  last_interaction_at: string;
}

export interface NeedleDrop {
  id: string;
  tether_id: string;
  sender_id: string;
  track_name: string;
  artist_name: string;
  artwork_url: string | null;
  preview_url: string | null;
  status: "waiting" | "played";
  created_at: string;
  played_at: string | null;
}

export interface LastLocation {
  user_id: string;
  tether_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

/** Payload each client tracks into the shared Presence channel. */
export interface PresencePayload {
  user_id: string;
  lat: number | null;
  lng: number | null;
  together: boolean;
  online_at: string;
}

/** The shared moods that tint both partners' ambient space. */
export const MOODS = [
  { key: "calm", label: "calm", color: "#8fa8c9" },
  { key: "cozy", label: "cozy", color: "#f2b263" },
  { key: "missing", label: "missing you", color: "#f4a6bd" },
  { key: "playful", label: "playful", color: "#b78df2" },
  { key: "tired", label: "tired", color: "#7d8a99" },
  { key: "loved", label: "loved", color: "#e86a8a" },
] as const;

export type MoodKey = (typeof MOODS)[number]["key"];

export function moodColor(key: string): string {
  return MOODS.find((m) => m.key === key)?.color ?? "#8fa8c9";
}
