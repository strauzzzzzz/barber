// После `npm run build`: в фронтенд-бандле не должно быть ключей и обращений к Groq/service role.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const patterns = [/gsk_[A-Za-z0-9]{10,}/, /api\.groq\.com/i, /GROQ_API_KEY/, /SERVICE_ROLE/i, /service_role/];
// если секреты есть в окружении, ищем и их точные значения
const secrets = ['GROQ_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].map((k) => process.env[k]).filter(Boolean);

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let fail = 0;
for (const f of walk('dist').filter((f) => /\.(js|css|html|webmanifest|map)$/.test(f))) {
  const s = readFileSync(f, 'utf8');
  for (const re of patterns) if (re.test(s)) { console.error(`FOUND ${re} in ${f}`); fail++; }
  for (const v of secrets) if (s.includes(v)) { console.error(`FOUND secret value in ${f}`); fail++; }
}
console.log(fail ? `FAIL: ${fail} совпадений` : 'OK: в dist нет ключей Groq/service role и обращений к api.groq.com');
process.exit(fail ? 1 : 0);
