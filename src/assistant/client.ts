// Astro Health AI — browser side. Talks only to our own server (/api/chat), never to Groq.
import {
  buildFactPack,
  buildModelContext,
  fallbackAnswer,
  finalizeAnswer,
  type AskKind,
  type AssistantInput,
  type ChatAnswer,
  type ChatTurn,
  type FactPack,
} from './facts';

export const CLIENT_TIMEOUT_MS = 8000;
/** How many earlier chat messages go with each request. */
export const HISTORY_SIZE = 6;

export type FallbackReason = 'offline' | 'timeout' | 'rate_limit' | 'no_key' | 'error';

export interface CapcomResult {
  pack: FactPack;
  answer: ChatAnswer;
  /** false → no status chip, no actions / contact / source. */
  inScope: boolean;
  mode: 'ai' | 'fallback';
  reason?: FallbackReason;
}

const REASONS: Record<string, FallbackReason> = { rate_limit: 'rate_limit', timeout: 'timeout', no_key: 'no_key' };

export async function askCapcom(
  kind: AskKind,
  input: AssistantInput,
  question: string,
  history: ChatTurn[] = [],
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; online?: boolean } = {},
): Promise<CapcomResult> {
  const recent = history.slice(-HISTORY_SIZE).map((t) => ({ from: t.from, text: t.text.slice(0, 500) }));
  const pack = buildFactPack(kind, input, question, recent);
  const context = buildModelContext(input);
  const fallback = (reason: FallbackReason): CapcomResult => ({ pack, ...fallbackAnswer(pack), mode: 'fallback', reason });

  const online = opts.online ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (!online) return fallback('offline');

  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? CLIENT_TIMEOUT_MS);
  try {
    const res = await fetchImpl('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: kind, question, facts: pack.facts, context, history: recent }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    if (res.status === 429) return fallback('rate_limit');
    if (!res.ok || !body?.ok) return fallback(REASONS[body?.reason] ?? 'error');
    return { pack, ...finalizeAnswer(pack, body.answer, { context, question, history: recent }), mode: 'ai' };
  } catch (err) {
    return fallback((err as Error)?.name === 'AbortError' ? 'timeout' : 'error');
  } finally {
    clearTimeout(timer);
  }
}

/** Is the server configured with a model key? (Does not call the model.) */
export async function fetchLinkStatus(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl('/api/status');
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body?.configured);
  } catch {
    return false;
  }
}

/** "MET 18:07:42" — current mission day, then the local clock HH:MM. */
export function metStamp(missionDay: number, at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `MET ${p(missionDay)}:${p(at.getHours())}:${p(at.getMinutes())}`;
}
