import { afterEach, describe, expect, it, vi } from 'vitest';
import { groqLlm, LlmError } from '../api/_lib/llm';
import { CHAT } from '../shared/config';

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 5 } }), { status: 200 });
const fail = (status: number, retryAfter = '0') => new Response('{"error":{"message":"limit"}}', { status, headers: { 'retry-after': retryAfter } });
const run = () => groqLlm('k')([{ role: 'user', content: 'hi' }], []);
const models = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).model);

afterEach(() => vi.unstubAllGlobals());

describe('Groq-клиент', () => {
  it('429 с короткой паузой: повторяет на той же модели', async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('привет'));
    vi.stubGlobal('fetch', f);
    expect((await run()).content).toBe('привет');
    expect(models(f)).toEqual([CHAT.model, CHAT.model]);
  });

  it('429 с долгой паузой: сразу уходит на запасную модель (у неё свой лимит)', async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(429, '30')).mockResolvedValueOnce(ok('запасная'));
    vi.stubGlobal('fetch', f);
    expect((await run()).content).toBe('запасная');
    expect(models(f)).toEqual([CHAT.model, CHAT.fallbackModel]);
  });

  it('обе модели недоступны: ошибка с retryAfter, без бесконечных повторов', async () => {
    const f = vi.fn().mockImplementation(async () => fail(429, '30'));
    vi.stubGlobal('fetch', f);
    await expect(run()).rejects.toMatchObject({ status: 429, retryAfter: 30 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('5xx повторяется, 401 — нет', async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok('ок'));
    vi.stubGlobal('fetch', f);
    expect((await run()).content).toBe('ок');
    const g = vi.fn().mockImplementation(async () => fail(401));
    vi.stubGlobal('fetch', g);
    await expect(run()).rejects.toBeInstanceOf(LlmError);
    expect(g).toHaveBeenCalledTimes(1);
  });
});
