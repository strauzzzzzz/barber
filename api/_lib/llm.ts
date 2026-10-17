import { CHAT } from '../../shared/config';
import { todayIn, addDays } from '../../shared/time';
import { SALON } from '../../shared/config';

export interface LlmMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: any[]; tool_call_id?: string }
export type Llm = (messages: LlmMessage[], tools: unknown[]) => Promise<LlmMessage>;

export class LlmError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call(key: string, model: string, messages: LlmMessage[], tools: unknown[]): Promise<LlmMessage> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages, tools, tool_choice: 'auto', parallel_tool_calls: false,
      temperature: CHAT.temperature, max_completion_tokens: CHAT.maxTokens,
      ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new LlmError(res.status, (await res.text()).slice(0, 300));
  const data: any = await res.json();
  return data.choices[0].message;
}

/** Groq: основная модель, при tool_use_failed/недоступности — запасная. */
export const groqLlm = (key: string): Llm => async (messages, tools) => {
  try {
    return await call(key, CHAT.model, messages, tools);
  } catch (e) {
    if (e instanceof LlmError && (e.status === 400 || e.status === 404 || e.status >= 500) && CHAT.fallbackModel) {
      return call(key, CHAT.fallbackModel, messages, tools);
    }
    throw e;
  }
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
    return call('get_free_slots', { service_id: 'Мужская стрижка', date_from: from, date_to: addDays(from, 2) });
  }
  return { role: 'assistant', content: 'Уточните, пожалуйста, услугу и удобный день.' };
};
