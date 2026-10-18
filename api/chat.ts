import { bearer, clientIp, clientToken, route } from './_lib/http';
import { AppError } from './_lib/booking';
import { handleChat } from './_lib/chat';
import { groqLlm, mockLlm } from './_lib/llm';

export default route(['POST'], async (req, _res, store) => {
  const key = process.env.GROQ_API_KEY;
  const mock = process.env.GROQ_MOCK === '1';
  if (!key && !mock) throw new AppError(503, 'LLM_DOWN', 'Помощник не настроен. Запишитесь вручную на вкладке «Запись».');
  const jwt = bearer(req);
  const admin = jwt ? await store.adminEmail(jwt).catch(() => null) : null; // права админа — только по проверенному JWT
  return handleChat(
    { store, llm: mock ? mockLlm : groqLlm(key!), token: clientToken(req), ip: clientIp(req), admin, now: Date.now() },
    req.body ?? {},
  );
});
