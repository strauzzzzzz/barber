import { CHAT } from '../../shared/config';
import { todayIn, addDays } from '../../shared/time';
import { SALON } from '../../shared/config';

export interface LlmMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: any[]; tool_call_id?: string }
export type Llm = (messages: LlmMessage[], tools: unknown[]) => Promise<LlmMessage>;

export class LlmError extends Error {
  constructor(public status: number, message: string, public retryAfter = 0) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// у функции Vercel общий лимит времени (30 с): долго ждать повтора нельзя
const MAX_WAIT_S = 3;
const CALL_TIMEOUT_MS = 12000;

async function call(key: string, model: string, messages: LlmMessage[], tools: unknown[]): Promise<LlmMessage> {
  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, messages, tools, tool_choice: 'auto', parallel_tool_calls: false,
        temperature: CHAT.temperature, max_completion_tokens: CHAT.maxTokens,
        ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    throw new LlmError(504, 'timeout');
  }
  if (!res.ok) throw new LlmError(res.status, (await res.text()).slice(0, 300), Number(res.headers.get('retry-after')) || 0);
  const data: any = await res.json();
  console.log(`groq ${model} tokens=${data.usage?.total_tokens ?? '?'}`); // расход видно в логах Vercel
  return data.choices[0].message;
}

/** Одна модель: до 2 повторов при 429/5xx, если ждать недолго. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const again = e instanceof LlmError && (e.status === 429 || e.status >= 500) && i < 2 && e.retryAfter <= MAX_WAIT_S;
      if (!again) throw e;
      await sleep(Math.max((e as LlmError).retryAfter, 0.6 * (i + 1)) * 1000);
    }
  }
}

/** Groq: основная модель с повторами; при 429 (у каждой модели свой лимит), 5xx, tool_use_failed — запасная. */
export const groqLlm = (key: string): Llm => async (messages, tools) => {
  let last: unknown;
  for (const model of [CHAT.model, CHAT.fallbackModel].filter(Boolean)) {
    try {
      return await withRetry(() => call(key, model, messages, tools));
    } catch (e) {
      last = e;
      if (!(e instanceof LlmError) || ![400, 404, 429].includes(e.status) && e.status < 500) throw e;
    }
  }
  throw last;
};

/** Скриптованная «модель» для локальной разработки и тестов (GROQ_MOCK=1): без ключа Groq. */
export const mockLlm: Llm = async (messages) => {
  const last = messages[messages.length - 1];
  if (last.role === 'tool') return { role: 'assistant', content: 'Вот что нашлось по расписанию — выберите удобное время в карточке.' };
  const text = String([...messages].reverse().find((m) => m.role === 'user')?.content ?? '').toLowerCase();
  const call = (name: string, args: object) => ({ role: 'assistant' as const, content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
  if (/мои запис/.test(text)) return call('get_my_bookings', {});
  if (/свобод|сегодн|врем|запис/.test(text)) {
    const from = /сегодн/.test(text) ? todayIn(SALON.timezone) : todayIn(SALON.timezone);
    return call('get_free_slots', { service: 'Мужская стрижка', date_from: from, date_to: addDays(from, 2) });
  }
  return { role: 'assistant', content: 'Уточните, пожалуйста, услугу и удобный день.' };
};
