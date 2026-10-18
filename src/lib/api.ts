import type { ApiErrorBody, BookingDTO, Catalog, ChatRequest, ChatResponse, SlotGroup } from '../../shared/types';
import { getToken, hasAdminSession } from './session';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Partial<ApiErrorBody> = {}) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, extra: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', 'x-client-token': getToken(), ...extra } });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Нет соединения с интернетом. Проверьте сеть и повторите.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'ERROR', data.message ?? 'Что-то пошло не так, попробуйте ещё раз', data);
  return data as T;
}

const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

/** Токен админа прикладываем только если он залогинен: сервер сам проверяет его и права. */
async function adminHeader(): Promise<Record<string, string>> {
  if (!hasAdminSession()) return {};
  try {
    const { accessToken } = await import('./supabase');
    const t = await accessToken();
    return t ? { authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

export interface BookInput {
  service_id: string; master_id: string; date: string; time: string;
  name: string; phone: string; consent: boolean; reminders: boolean; source: 'web' | 'chat';
}

export const api = {
  catalog: () => call<Catalog>('/api/catalog'),
  slots: (p: { service_id: string; master_id?: string; date_from: string; date_to: string; exclude?: string }) =>
    call<{ groups: SlotGroup[] }>('/api/slots?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][])),
  myBookings: () => call<{ bookings: BookingDTO[] }>('/api/bookings'),
  book: (b: BookInput) => call<{ booking: BookingDTO }>('/api/bookings', send('POST', b)),
  reschedule: (ref: string, date: string, time: string) => call<{ booking: BookingDTO }>('/api/bookings', send('PATCH', { ref, date, time })),
  cancel: (ref: string) => call<{ booking: BookingDTO }>('/api/bookings', send('DELETE', { ref })),
  chat: async (body: ChatRequest) => call<ChatResponse>('/api/chat', send('POST', body), await adminHeader()),
};
