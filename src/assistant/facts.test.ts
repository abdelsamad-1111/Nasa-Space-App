import { describe, expect, it, vi } from 'vitest';
import { buildAlerts, detectPatterns, evaluateDay, evaluateExerciseOnDay, overallStatus } from '../brain/evaluate';
import { ESCALATION, HOW_TO, type Location, type MetricId } from '../brain/indicators';
import { DEMO_SETTINGS, generateDemoMission } from '../data/demo';
import {
  buildFactPack,
  buildModelContext,
  finalizeAnswer,
  guessInScope,
  NO_ESCALATION,
  OUT_OF_SCOPE_ANSWER,
  welcomeMessage,
  type AssistantInput,
  type ChatTurn,
} from './facts';
import { askCapcom, metStamp } from './client';

const MS = generateDemoMission(new Date(Date.UTC(2026, 0, 1)).toISOString());

function inputFor(day: number, selected: MetricId = 'temp', location: Location = 'ISS'): AssistantInput {
  const settings = { ...DEMO_SETTINGS, location };
  const evals = evaluateDay(MS, day, settings);
  const exercise = evaluateExerciseOnDay(MS, day);
  const patterns = detectPatterns(MS, day);
  return {
    measurements: MS,
    settings,
    day,
    selected,
    evals,
    metrics: exercise ? { ...evals, exercise } : evals,
    patterns,
    overall: overallStatus(evals, patterns),
    openAlerts: buildAlerts(MS, day, settings, []).filter((a) => a.open),
  };
}

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;

describe('Welcome message (app data only)', () => {
  it('greets by name and summarises Day 18 on the ISS', () => {
    const w = welcomeMessage(inputFor(18), new Date(2026, 0, 1, 8, 0));
    expect(w.reply).toMatch(/^Good morning, A\. Rahman\. Day 18 on the ISS\./);
    expect(w.reply).toMatch(/temperature, sleep and mood need attention today/);
    expect(w.reply).toMatch(/What would you like to check\?$/);
    expect(w.followups).toHaveLength(2);
  });
  it('a calm day says everything is within range', () => {
    expect(welcomeMessage(inputFor(5), new Date(2026, 0, 1, 20, 0)).reply).toMatch(/Good evening.*Everything is within range today/);
  });
});

describe('Facts and built-in answers come from evaluate.ts / indicators.ts', () => {
  it('Day 18 status: Act chip, escalation with the ISS text, no source', () => {
    const p = buildFactPack('status', inputFor(18));
    expect(p.status).toBe('ACT');
    expect(p.fallback.contact).toBe(ESCALATION.ISS);
    expect(p.fallback.source).toBe('');
    expect(p.fallback.actions.length).toBeLessThanOrEqual(3);
  });

  it('trend question: the first sentence answers with the real readings', () => {
    const p = buildFactPack('question', inputFor(18), 'Why is my temperature flagged and is it getting better?');
    expect(p.inScope).toBe(true);
    expect(p.fallback.reply.split(/(?<=[.!?])\s+/)[0]).toBe('Not yet — your temperature is worse than the day before: 37.2 °C → 38.3 °C.');
    expect(p.statusLabel).toBe('Body temperature · Day 18');
  });

  it('follow-up "and what about yesterday?" keeps the topic from the chat and moves to Day 17', () => {
    const history: ChatTurn[] = [{ from: 'CREW', text: 'Why is my temperature flagged and is it getting better?' }];
    const p = buildFactPack('question', inputFor(18, 'hr'), 'And what about yesterday?', history);
    expect(p.inScope).toBe(true);
    expect(p.statusLabel).toBe('Body temperature · Day 17');
    expect(p.status).toBe('OK');
    expect(p.fallback.reply).toMatch(/^Your temperature on Day 17 was 37\.2 °C, status OK\./);
  });

  it('out-of-scope guess for a broken tooth', () => {
    expect(guessInScope('Can you check my broken tooth?', [])).toBe(false);
    expect(guessInScope('How is my sleep?', [])).toBe(true);
  });

  it('actions only when asked or Act/Critical; contact only when Act/Critical or asked', () => {
    const calm = inputFor(5, 'hr');
    expect(buildFactPack('reading', calm).showActions).toBe(false);
    expect(buildFactPack('reading', calm).fallback.contact).toBe('');
    expect(buildFactPack('question', calm, 'What should I do about my heart rate?').showActions).toBe(true);
    expect(buildFactPack('question', calm, 'Do I need to call the ground?').fallback.contact).toBe(NO_ESCALATION);
    expect(buildFactPack('contact', inputFor(18, 'temp', 'MARS')).fallback.contact).toBe(ESCALATION.MARS);
  });

  it('How to measure returns the HOW_TO steps', () => {
    expect(buildFactPack('measure', inputFor(18, 'hr')).fallback.actions).toEqual(HOW_TO.hr);
  });

  it('every built-in answer obeys the format limits', () => {
    for (const kind of ['status', 'reading', 'todo', 'contact', 'pattern', 'measure', 'question'] as const) {
      for (const day of [5, 18, 22]) {
        const a = buildFactPack(kind, inputFor(day), 'How is my temperature?').fallback;
        expect(sentences(a.reply)).toBeLessThanOrEqual(4);
        expect(a.actions.length).toBeLessThanOrEqual(3);
        expect(a.followups).toHaveLength(2);
      }
    }
  });

  it('APP_DATA has 7 days of readings and stays small', () => {
    const ctx = buildModelContext(inputFor(18));
    expect(ctx.last7Days.rows).toHaveLength(7);
    expect(Object.keys(ctx.thresholds)).toHaveLength(9);
    expect(JSON.stringify(ctx).length).toBeLessThan(5_000);
  });
});

describe('Rules applied to the model answer', () => {
  const pack = buildFactPack('question', inputFor(18), 'Why is my temperature flagged and is it getting better?');
  const extra = { context: buildModelContext(inputFor(18)) };

  it('a trend question is answered first with the real readings; actions are not repeated in the reply', () => {
    const r = finalizeAnswer(pack, {
      reply: 'Your temperature is flagged because it is 38.3 °C today. Rest and drink fluids if you can do so safely. Get urgent help now for serious symptoms such as trouble breathing, confusion or a stiff neck.',
    }, extra);
    expect(r.answer.reply).toBe('Not yet — your temperature is worse than the day before: 37.2 °C → 38.3 °C. Your temperature is flagged because it is 38.3 °C today.');
    const direct = finalizeAnswer(pack, { reply: 'Not yet — it rose from 37.2 °C to 38.3 °C. Keep resting.' }, extra);
    expect(direct.answer.reply).toBe('Not yet — it rose from 37.2 °C to 38.3 °C. Keep resting.');
  });

  it('reply is cut to 4 sentences', () => {
    const r = finalizeAnswer(buildFactPack('status', inputFor(18)), { reply: 'One. Two. Three. Four. Five.' }, extra);
    expect(r.answer.reply).toBe('One. Two. Three. Four.');
  });

  it('invented numbers or a status word the app did not give → built-in reply', () => {
    expect(finalizeAnswer(pack, { reply: 'It is 41.2 °C.' }, extra).answer.reply).toBe(pack.fallback.reply);
    expect(finalizeAnswer(pack, { reply: 'Your temperature is Critical.' }, extra).answer.reply).toBe(pack.fallback.reply);
    expect(finalizeAnswer(pack, { reply: 'Not yet — 37.2 °C yesterday, 38.3 °C today.' }, extra).answer.reply).toBe('Not yet — 37.2 °C yesterday, 38.3 °C today.');
  });

  it('actions must stay tied to app guidance and avoid Earth-only advice', () => {
    const r = finalizeAnswer(pack, { actions: ['Rest in your crew quarters and drink fluids.', 'Call 911.', 'Take two tablets of a new drug.'] }, extra);
    expect(r.answer.actions).toEqual(['Rest in your crew quarters and drink fluids.']);
  });

  it('long symptom lists are trimmed from actions; off-topic follow-ups are replaced', () => {
    const r = finalizeAnswer(pack, {
      actions: ['Get urgent help now for serious symptoms such as trouble breathing, confusion or a stiff neck.'],
      followups: ['What other signs indicate infection?', 'Would you like to review your sleep?'],
    }, extra);
    expect(r.answer.actions).toEqual(['Get urgent help now for serious symptoms.']);
    expect(r.answer.followups).toEqual(pack.fallback.followups);
  });

  it('contact is always the app escalation text for Act/Critical, whatever the model says', () => {
    expect(finalizeAnswer(pack, { contact: 'No need to call anyone.' }, extra).answer.contact).toBe(ESCALATION.ISS);
  });

  it('only sources from indicators.ts are allowed', () => {
    expect(finalizeAnswer(pack, { source: 'https://example.com/x' }, extra).answer.source).toBe(pack.sourceUrls[0]);
  });

  it('out of scope: no status, actions, contact or source; kind reply kept', () => {
    const tooth = buildFactPack('question', inputFor(18), 'Can you check my broken tooth?');
    const r = finalizeAnswer(tooth, { inScope: false, reply: 'I can’t check teeth. Please see your crew medical officer.', actions: ['x'], contact: 'y', source: 'z', followups: ['How is my sleep?', 'Explain my status today'] }, extra);
    expect(r.inScope).toBe(false);
    expect(r.answer).toMatchObject({ actions: [], contact: '', source: '' });
    expect(r.answer.followups).toEqual(['How is my sleep?', 'Explain my status today']);
  });

  it('quick actions are always in scope', () => {
    expect(finalizeAnswer(buildFactPack('status', inputFor(18)), { inScope: false, reply: 'x' }, extra).inScope).toBe(true);
  });
});

describe('Fallback when the link fails', () => {
  const okBody = { ok: true, answer: { inScope: true, reply: 'Explained.', actions: [], contact: '', source: '', followups: [] } };
  const reply = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  it('uses the model reply when the server answers', async () => {
    const r = await askCapcom('reading', inputFor(18), 'Explain this reading', [], { fetchImpl: reply(200, okBody), online: true });
    expect(r.mode).toBe('ai');
    expect(r.answer.reply).toBe('Explained.');
    expect(r.answer.followups).toHaveLength(2);
  });

  it('sends the last 6 chat messages', async () => {
    const f = reply(200, okBody);
    const history: ChatTurn[] = Array.from({ length: 9 }, (_, i) => ({ from: i % 2 ? 'CAPCOM' : 'CREW', text: `m${i}` }));
    await askCapcom('question', inputFor(18), 'and yesterday?', history, { fetchImpl: f as unknown as typeof fetch, online: true });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.history.map((t: ChatTurn) => t.text)).toEqual(['m3', 'm4', 'm5', 'm6', 'm7', 'm8']);
  });

  it('429 → built-in guidance', async () => {
    const r = await askCapcom('todo', inputFor(18), 'What should I do now?', [], { fetchImpl: reply(429, { ok: false, reason: 'rate_limit' }), online: true });
    expect(r).toMatchObject({ mode: 'fallback', reason: 'rate_limit' });
    expect(r.answer).toEqual(r.pack.fallback);
  });

  it('out-of-scope question offline → kind built-in reply, no chip', async () => {
    const r = await askCapcom('question', inputFor(18), 'Can you check my broken tooth?', [], { online: false });
    expect(r.inScope).toBe(false);
    expect(r.answer).toEqual(OUT_OF_SCOPE_ANSWER);
  });

  it('no reply within the timeout → built-in guidance', async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const r = await askCapcom('status', inputFor(18), 'Explain my status today', [], { fetchImpl: hang as unknown as typeof fetch, timeoutMs: 30, online: true });
    expect(r).toMatchObject({ mode: 'fallback', reason: 'timeout' });
  });

  it('MET stamp format', () => {
    expect(metStamp(18, new Date(2026, 0, 1, 7, 42))).toBe('MET 18:07:42');
  });
});
