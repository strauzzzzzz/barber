import { THEME } from '../../shared/config';

// Клиенту не нужен аккаунт: сессия = случайный токен в браузере. Любое обращение к storage может падать (приватный режим).
let memToken = '';

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* без хранилища работаем в памяти */ } };

export function getToken(): string {
  const t = get('br_token') || memToken;
  if (t) return t;
  memToken = crypto.randomUUID();
  set('br_token', memToken);
  return memToken;
}

export interface Profile { name: string; phone: string }
export const loadProfile = (): Profile => {
  try { return { name: '', phone: '', ...JSON.parse(get('br_profile') || '{}') }; } catch { return { name: '', phone: '' }; }
};
export const saveProfile = (p: Profile) => set('br_profile', JSON.stringify(p));

export const getTheme = (): 'dark' | 'light' => (get('br_theme') === 'light' ? 'light' : 'dark');
export function setTheme(t: 'dark' | 'light') {
  set('br_theme', t);
  document.documentElement.dataset.theme = t === 'light' ? 'light' : '';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f3f1ec' : THEME.bg);
}

export const loadJson = <T,>(k: string, fallback: T): T => { try { return JSON.parse(get(k) || '') as T; } catch { return fallback; } };
export const saveJson = (k: string, v: unknown) => set(k, JSON.stringify(v));
export const hasAdminSession = () => get('barber-admin-auth') !== null;
