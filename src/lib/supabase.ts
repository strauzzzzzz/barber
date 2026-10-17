import { createClient } from '@supabase/supabase-js';

// Публичные значения (anon key безопасен: данные закрыты RLS, писать/читать может только админ из admin_emails).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = !!(url && key);
export const sb = createClient(url || 'http://localhost', key || 'missing', { auth: { storageKey: 'barber-admin-auth' } });

export async function accessToken(): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
