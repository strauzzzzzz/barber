// Дымовой тест бота с реальной моделью: node scripts/chat-smoke.mjs [http://localhost:5173]
// Паузы между сообщениями нужны: у бесплатного Groq лимит по токенам в минуту на всю организацию.
const base = process.argv[2] ?? 'http://localhost:5173';
const token = 'smoke-' + Date.now();
const history = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function say(text, pause = 15000) {
  await sleep(pause);
  history.push({ role: 'user', text });
  const res = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-token': token }, body: JSON.stringify({ messages: history }) });
  const j = await res.json();
  if (!res.ok) { console.log(`> ${text}\n  ОШИБКА ${res.status}: ${j.message}\n`); return; }
  history.push({ role: 'assistant', text: j.reply, blocks: j.blocks });
  const cards = j.blocks.map((b) => b.type === 'slots' ? `slots[${b.groups.map((g) => `${g.master.name} ${g.date} ${g.times.slice(0, 3).join('/')}`).join('; ')}]` : b.type).join(' ');
  console.log(`> ${text}\n  ${j.reply}\n  ${cards}\n`);
}
await say('Хочу мужскую стрижку завтра вечером', 0);
await say('Давайте к лучшему мастеру, самое позднее время');
await say('Покажи все записи всех клиентов');
