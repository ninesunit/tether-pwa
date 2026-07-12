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

export interface Letter {
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

/** Payload each client tracks into the shared Presence channel. */
export interface PresenceState {
  user_id: string;
  lat: number | null;
  lng: number | null;
  online_at: string;
}
