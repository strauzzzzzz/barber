import type { VercelRequest, VercelResponse } from '@vercel/node';
import { memoryStore } from './memory';
import { supabaseStore, type Store } from './store';
import { AppError } from './booking';

let store: Store | undefined;
export function getStore(): Store {
  if (store) return store;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_MODE } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) return (store = supabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY));
  if (DEMO_MODE === '1') return (store = memoryStore());
  throw new AppError(503, 'NOT_CONFIGURED', 'Сервер не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
}

const header = (req: VercelRequest, name: string) => String(req.headers[name] ?? '').trim();
export const clientToken = (req: VercelRequest) => header(req, 'x-client-token').slice(0, 64);
export const clientIp = (req: VercelRequest) => header(req, 'x-forwarded-for').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
export const bearer = (req: VercelRequest) => header(req, 'authorization').replace(/^Bearer\s+/i, '');

/** Единая обёртка: метод, ошибки → JSON {error, message}. */
export function route(methods: string[], fn: (req: VercelRequest, res: VercelResponse, store: Store) => Promise<unknown>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('cache-control', 'no-store');
    if (!methods.includes(req.method ?? '')) return res.status(405).json({ error: 'METHOD', message: 'Метод не поддерживается' });
    try {
      const out = await fn(req, res, getStore());
      if (!res.writableEnded) res.status(200).json(out);
    } catch (e) {
      if (e instanceof AppError) return res.status(e.status).json({ error: e.code, message: e.message, ...e.extra });
      console.error(e);
      res.status(500).json({ error: 'INTERNAL', message: 'Ошибка сервера, попробуйте ещё раз' });
    }
  };
}
