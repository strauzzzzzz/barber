import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { SALON, THEME } from './shared/config';

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

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const manifest = () => JSON.stringify({
  name: `${SALON.name} — запись`,
  short_name: SALON.shortName,
  description: `Онлайн-запись в «${SALON.name}»: чат-помощник подберёт мастера и свободное время.`,
  lang: 'ru', start_url: '/', scope: '/', id: '/', display: 'standalone', orientation: 'portrait',
  background_color: THEME.bg, theme_color: THEME.bg, categories: ['lifestyle', 'business'],
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: 'Записаться', url: '/#book', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    { name: 'Мои записи', url: '/#my', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
  ],
}, null, 2);

// Название и цвета живут только в shared/config.ts: отсюда они попадают в index.html, manifest и CSS-переменные.
function salonStatic(): Plugin {
  const themeCss = `<style>
html:root { --accent: ${THEME.accent}; --accent-hover: ${THEME.accentHover}; --accent-text: ${THEME.accentText}; --accent-soft: ${rgba(THEME.accent, 0.2)}; --glow: ${rgba(THEME.glow, 0.5)}; --bg: ${THEME.bg}; }
html:root[data-theme='light'] { --accent: ${THEME.lightAccent}; --accent-hover: ${THEME.lightAccentHover}; --accent-text: ${THEME.lightAccent}; --accent-soft: ${rgba(THEME.lightAccent, 0.1)}; --glow: ${rgba(THEME.lightAccent, 0.38)}; --bg: #f3f1ec; }
</style>`;
  return {
    name: 'salon-static',
    transformIndexHtml: (html) =>
      html.replaceAll('{{NAME}}', SALON.name).replaceAll('{{SHORT}}', SALON.shortName).replaceAll('{{BG}}', THEME.bg).replace('</head>', `${themeCss}
  </head>`),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => { res.setHeader('content-type', 'application/manifest+json'); res.end(manifest()); });
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() }); },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), salonStatic(), devApi(loadEnv(mode, process.cwd(), ''))],
  server: { host: true },
  build: { sourcemap: false },
}));
