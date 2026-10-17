import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Локально /api/* обслуживается прямо из Vite теми же обработчиками, что и на Vercel.
// Нет Supabase → демо-режим (данные в памяти из shared/seed.ts); нет ключа Groq → скриптованный бот.
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_')) process.env[k] ??= v;
      if (!process.env.SUPABASE_URL) process.env.DEMO_MODE = '1';
      if (!process.env.GROQ_API_KEY) process.env.GROQ_MOCK = '1';
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const m = url.pathname.match(/^\/api\/([a-z]+)$/);
        if (!m) return next();
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const raw = Buffer.concat(chunks).toString();
        const r = req as any;
        r.query = Object.fromEntries(url.searchParams);
        try { r.body = raw ? JSON.parse(raw) : undefined; } catch { r.body = undefined; }
        const w = res as any;
        w.status = (c: number) => { res.statusCode = c; return w; };
        w.json = (b: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)); return w; };
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          await mod.default(req, res);
        } catch (e) {
          console.error(e);
          w.status(500).json({ error: 'INTERNAL', message: String(e) });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), ''))],
  server: { host: true },
  build: { sourcemap: false },
}));
