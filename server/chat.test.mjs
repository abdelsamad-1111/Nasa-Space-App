import { describe, expect, it, vi } from 'vitest';
import { GROQ_MODEL, handleChat } from './chat.mjs';

const FAKE_KEY = 'test-key-not-real';
const payload = { action: 'reading', question: 'Explain this reading', facts: { status: 'Act' }, context: { missionDay: 18 } };
const groqReply = (status, content) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));

describe('POST /api/chat → Groq', () => {
  it('without a key it falls back and never calls Groq', async () => {
    const f = groqReply(200, '{}');
    expect(await handleChat(payload, { apiKey: '', fetchImpl: f })).toEqual({ ok: false, reason: 'no_key' });
    expect(f).not.toHaveBeenCalled();
  });

  it('calls the chosen model in JSON mode and returns a cleaned answer', async () => {
    const f = groqReply(200, JSON.stringify({ inScope: true, reply: 'r', actions: ['a', 'b', 'c', 'd'], contact: '', source: 's', followups: ['x?', 'y?', 'z?'] }));
    const r = await handleChat({ ...payload, history: [{ from: 'CREW', text: 'How is my temperature?' }] }, { apiKey: FAKE_KEY, fetchImpl: f });
    expect(r.ok).toBe(true);
    expect(r.answer.actions).toHaveLength(3);
    expect(r.answer.followups).toHaveLength(2);
    expect(r.answer.inScope).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(GROQ_MODEL);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(init.headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    // Recent chat goes with the request so follow-ups work.
    expect(body.messages[1].content).toContain('CREW: How is my temperature?');
    // The key is only in the header — never in the prompt or the result.
    expect(init.body).not.toContain(FAKE_KEY);
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });

  it('429 → rate_limit', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 429 }));
    expect(await handleChat(payload, { apiKey: FAKE_KEY, fetchImpl: f })).toEqual({ ok: false, reason: 'rate_limit' });
  });

  it('timeout → timeout', async () => {
    const hang = vi.fn((_u, init) => new Promise((_res, rej) => {
      init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    expect(await handleChat(payload, { apiKey: FAKE_KEY, fetchImpl: hang, timeoutMs: 20 })).toEqual({ ok: false, reason: 'timeout' });
  });

  it('non-JSON model output → bad_json', async () => {
    const f = groqReply(200, 'not json');
    expect(await handleChat(payload, { apiKey: FAKE_KEY, fetchImpl: f })).toEqual({ ok: false, reason: 'bad_json' });
  });
});
