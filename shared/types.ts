export interface Service {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  price: number;
  active: boolean;
  sort: number;
}

export interface Master {
  id: string;
  name: string;
  title: string;
  bio: string;
  active: boolean;
  rating: number;
  reviews_count: number;
  sort: number;
}

export interface Catalog {
  services: Service[];
  masters: Master[];
  links: { master_id: string; service_id: string }[];
}

export type Status = 'pending' | 'confirmed' | 'arrived' | 'no_show' | 'cancelled';

export interface Rule { master_id: string; weekday: number; start_time: string; end_time: string }
export interface Break { master_id: string; weekday: number; start_time: string; end_time: string }
export interface Exception {
  master_id: string;
  date_from: string;
  date_to: string;
  kind: 'off' | 'vacation' | 'hours';
  start_time: string | null;
  end_time: string | null;
}

export interface BookingRow {
  id: string;
  code: string;
  master_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  client_name: string;
  client_phone: string;
  client_token: string | null;
  status: Status;
  price: number;
  source: 'web' | 'chat' | 'admin';
}

/** Свободные окна одного мастера в один день; times — локальное время салона HH:MM. */
export interface SlotGroup { master_id: string; date: string; times: string[] }

export interface BookingDTO {
  id: string;
  code: string;
  service: { id: string; name: string };
  master: { id: string; name: string };
  starts_at: string;
  date: string;
  time: string;
  duration_min: number;
  price: number;
  status: Status;
  can_change: boolean;
}

export interface Draft {
  service_id: string;
  master_id: string;
  date: string;
  time: string;
  service_name: string;
  master_name: string;
  price: number;
  duration_min: number;
}

export interface MasterBrief { id: string; name: string; rating: number; reviews: number; recommended?: boolean }

export type ChatBlock =
  | { type: 'slots'; service: { id: string; name: string; price: number; duration_min: number }; groups: { master: MasterBrief; date: string; times: string[] }[] }
  | { type: 'masters'; masters: (MasterBrief & { title: string })[] }
  | { type: 'draft'; draft: Draft }
  | { type: 'bookings'; bookings: BookingDTO[] };

export interface ChatMessage { role: 'user' | 'assistant'; text: string; blocks?: ChatBlock[] }

export type ChatAction = { type: 'propose'; service_id: string; master_id: string; date: string; time: string };

export interface ChatRequest { messages: ChatMessage[]; action?: ChatAction }
export interface ChatResponse { reply: string; blocks: ChatBlock[] }

export interface ApiErrorBody { error: string; message: string; retry_after?: number; alternatives?: SlotGroup[] }
