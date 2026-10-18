import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStore } from './_lib/http';
import { groqLlm } from './_lib/llm';
import { addDays, todayIn } from '../shared/time';
import { SALON } from '../shared/config';

// GET /api/health — проверка после деплоя: открыть ссылку и убедиться, что всё зелёное.
// GET /api/health?llm=1 — дополнительно делает один настоящий запрос к Groq (не чаще 6 раз в час).
// Заодно годится для пинга раз в несколько дней: бесплатный Supabase засыпает после недели без обращений.
// Секреты и email-адреса не показываются.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('cache-control', 'no-store');
  const problems: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, unknown> = {
    groq_key: !!process.env.GROQ_API_KEY,
    supabase_env: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    demo_mode: process.env.DEMO_MODE === '1',
  };
  if (!checks.groq_key) warnings.push('Нет GROQ_API_KEY: чат-помощник выключен, ручная запись работает.');
  if (!checks.supabase_env && !checks.demo_mode) problems.push('Не заданы SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.');

  try {
    const store = getStore();
    const cat = await store.catalog();
    const services = cat.services.filter((s) => s.active);
    const masters = cat.masters.filter((m) => m.active);
    checks.database = 'ok';
    checks.services = services.length;
    checks.masters = masters.length;
    if (!services.length) problems.push('В базе нет активных услуг (выполните seed.sql или добавьте услуги в админке).');
    if (!masters.length) problems.push('В базе нет активных мастеров.');
    const names = masters.map((m) => m.name.toLowerCase());
    if (new Set(names).size !== names.length) warnings.push('Есть мастера с одинаковыми именами: бот выбирает по имени, дайте им разные имена.');

    const today = todayIn(SALON.timezone);
    const sched = await store.schedules(masters.map((m) => m.id), `${today}T00:00:00Z`, `${addDays(today, 1)}T00:00:00Z`);
    const noHours = masters.filter((m) => !sched.rules.some((r) => r.master_id === m.id)).map((m) => m.name);
    checks.masters_without_hours = noHours;
    if (noHours.length) warnings.push(`У мастеров нет рабочих часов: ${noHours.join(', ')} (заполните расписание в админке).`);
    const noServices = masters.filter((m) => !cat.links.some((l) => l.master_id === m.id)).map((m) => m.name);
    if (noServices.length) warnings.push(`Мастера без услуг: ${noServices.join(', ')}.`);

    const admins = await store.adminEmails();
    checks.admins = admins.length;
    if (!admins.length) problems.push('Список администраторов пуст (таблица admin_emails): войти в /admin не сможет никто.');
    else if (admins.some((e) => e.toLowerCase() === 'admin@example.com')) warnings.push('В admin_emails остался admin@example.com из seed — замените на настоящий email.');

    if (req.query.llm === '1' && process.env.GROQ_API_KEY) {
      if (!(await store.hitRate('health:llm', 3600, 6))) checks.llm = 'пропущено: не чаще 6 проверок в час';
      else {
        try {
          const r = await groqLlm(process.env.GROQ_API_KEY)([{ role: 'user', content: 'Reply with one word: ok' }], []);
          checks.llm = r.content ? 'ok' : 'пустой ответ';
        } catch (e) {
          checks.llm = `ошибка ${(e as { status?: number }).status ?? ''}`.trim();
          warnings.push('Groq не ответил (возможно, лимит запросов). Бот выдаст клиентам сообщение с предложением записаться вручную.');
        }
      }
    }
  } catch (e) {
    checks.database = 'error';
    problems.push(`База данных недоступна: ${(e as Error).message}`);
  }

  res.status(problems.length ? 503 : 200).json({ ok: problems.length === 0, problems, warnings, checks });
}
