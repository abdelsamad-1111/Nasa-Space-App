import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LOCATION_LABEL, STATUS_COLOR, STATUS_WORD, metricDef, type Status } from '../../brain/indicators';
import { worstIndicator } from '../../brain/evaluate';
import { useApp } from '../../state/AppState';
import { StatusIcon } from '../StatusBadge';
import { AstronautMark } from '../AstronautMark';
import { APP_NAME } from '../../lib/brand';
import { fmtNumber } from '../../lib/format';
import { QUICK_ACTIONS, sourceLabel, welcomeMessage, type AskKind, type AssistantInput, type ChatAnswer, type ChatTurn } from '../../assistant/facts';
import { askCapcom, fetchLinkStatus, metStamp, type CapcomResult, type FallbackReason } from '../../assistant/client';
import './assistant.css';

type Entry =
  | { id: number; met: string; sender: 'CREW'; text: string }
  | { id: number; met: string; sender: 'CAPCOM'; answer: ChatAnswer; result?: CapcomResult }
  | { id: number; met: string; sender: 'SYSTEM'; text: string };

const FALLBACK_REASON: Record<FallbackReason, string> = {
  offline: 'no connection',
  timeout: 'no reply within 8 s',
  rate_limit: 'model rate limit reached',
  no_key: 'model key not configured',
  error: 'link error',
};

function StatusChip({ status, label }: { status: Status; label: string }) {
  return (
    <div className="capcom-chip-row">
      <span className="capcom-chip" style={{ color: STATUS_COLOR[status], borderColor: STATUS_COLOR[status] }}>
        <StatusIcon status={status} size={10} />
        {STATUS_WORD[status]}
      </span>
      <span className="capcom-chip-label">{label}</span>
    </div>
  );
}

function CapcomMessage({ entry, onFollowup, disabled }: { entry: Extract<Entry, { sender: 'CAPCOM' }>; onFollowup: (q: string) => void; disabled: boolean }) {
  const { answer, result } = entry;
  const showChip = result && result.inScope && result.pack.status;
  return (
    <article className="capcom-msg capcom-msg-capcom">
      <AstronautMark size={30} className="capcom-avatar" />
      <div className="capcom-body">
        <div className="capcom-meta">
          <span className="capcom-met">{entry.met}</span>
          <span className="capcom-sender">{APP_NAME}</span>
        </div>
        {showChip && <StatusChip status={result.pack.status!} label={result.pack.statusLabel} />}
        <p className="capcom-reply">{answer.reply}</p>
        {answer.actions.length > 0 && (
          <ol className="capcom-actions">
            {answer.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>
        )}
        {answer.contact && (
          <p className="capcom-contact">
            <strong>Contact:</strong> {answer.contact}
          </p>
        )}
        {answer.source && (
          <p className="capcom-source">
            Source:{' '}
            <a href={answer.source} target="_blank" rel="noreferrer">{sourceLabel(answer.source)}</a>
          </p>
        )}
        {answer.followups.length > 0 && (
          <div className="capcom-followups" role="group" aria-label="Suggested questions">
            {answer.followups.map((f) => (
              <button key={f} className="capcom-followup" disabled={disabled} onClick={() => onFollowup(f)}>
                {f}
              </button>
            ))}
          </div>
        )}
        {result && (
          <p className="capcom-caption">
            {result.mode === 'ai'
              ? 'AI explanation — not a medical diagnosis.'
              : `Built-in guidance (${FALLBACK_REASON[result.reason ?? 'error']}) — not a medical diagnosis.`}
          </p>
        )}
      </div>
    </article>
  );
}

export function AssistantPanel() {
  const { assistantOpen, closeAssistant, assistantFocusToken, data, view, selectedMetric, openAlerts, today, screen } = useApp();
  const selected = selectedMetric ?? worstIndicator(view.evals);
  const [log, setLog] = useState<Entry[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [lastMode, setLastMode] = useState<'ai' | 'fallback' | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const focusTokenRef = useRef(0);
  const nextId = useRef(1);
  const visible = assistantOpen && screen !== 'checkin' && screen !== 'exercise';

  const input = useMemo<AssistantInput>(
    () => ({
      measurements: data.measurements,
      settings: data.settings,
      day: view.day,
      selected,
      evals: view.evals,
      metrics: view.metrics,
      patterns: view.patterns,
      overall: view.overall,
      openAlerts,
    }),
    [data.measurements, data.settings, view, selected, openAlerts],
  );

  const contextText = `Day ${fmtNumber(view.day)} · ${LOCATION_LABEL[data.settings.location]} · ${metricDef(selected).name}`;
  const contextKey = `${view.day}|${data.settings.location}|${selected}`;
  const lastContextKey = useRef(contextKey);

  useEffect(() => {
    if (assistantOpen && configured === null) fetchLinkStatus().then(setConfigured);
  }, [assistantOpen, configured]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Welcome message the first time the panel opens (built from app data, no model call).
  useEffect(() => {
    if (!visible) return;
    setLog((l) => (l.length ? l : [{ id: nextId.current++, met: metStamp(today), sender: 'CAPCOM', answer: welcomeMessage(input) }]));
    lastContextKey.current = contextKey;
  }, [visible]); // only on open: later context changes add a system line instead

  // Day / location / indicator changed → one small system line (a burst of changes updates the same line).
  useEffect(() => {
    if (lastContextKey.current === contextKey) return;
    lastContextKey.current = contextKey;
    setLog((l) => {
      if (!l.length) return l;
      const line: Entry = { id: nextId.current++, met: metStamp(today), sender: 'SYSTEM', text: `Context changed: ${contextText}` };
      return l[l.length - 1].sender === 'SYSTEM' ? [...l.slice(0, -1), line] : [...l, line];
    });
  }, [contextKey, contextText, today]);

  useEffect(() => {
    const opened = assistantOpen && !wasOpenRef.current;
    const focusRequested = assistantFocusToken !== focusTokenRef.current;
    if (visible && (opened || focusRequested)) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) {
        openerRef.current = active;
      }
      if (focusRequested) inputRef.current?.focus();
    } else if (!assistantOpen && wasOpenRef.current) {
      const opener = openerRef.current;
      openerRef.current = null;
      if (screen !== 'checkin' && screen !== 'exercise' && opener?.isConnected && !opener.closest('[inert]') && opener.getClientRects().length > 0) {
        opener.focus({ preventScroll: true });
      }
    }
    // Temporary screen hiding does not reopen the assistant or request input focus.
    wasOpenRef.current = assistantOpen;
    focusTokenRef.current = assistantFocusToken;
  }, [assistantOpen, assistantFocusToken, visible, screen]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log, busy]);

  const linkUp = online && configured === true && lastMode !== 'fallback';

  async function ask(kind: AskKind, question: string) {
    const q = question.trim();
    if (busy || !q) return;
    const history = log.flatMap<ChatTurn>((e) =>
      e.sender === 'CREW' ? [{ from: 'CREW', text: e.text }] : e.sender === 'CAPCOM' ? [{ from: 'CAPCOM', text: e.answer.reply }] : [],
    );
    setLog((l) => [...l, { id: nextId.current++, met: metStamp(today), sender: 'CREW', text: q }]);
    setBusy(true);
    const result = await askCapcom(kind, input, q, history);
    setLastMode(result.mode);
    setLog((l) => [...l, { id: nextId.current++, met: metStamp(today), sender: 'CAPCOM', answer: result.answer, result }]);
    setBusy(false);
  }

  /** A follow-up chip runs the matching quick action, or is sent as a question. */
  const followup = (q: string) => {
    const quick = QUICK_ACTIONS.find((a) => a.label.toLowerCase() === q.toLowerCase());
    void ask(quick ? quick.id : 'question', q);
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    const q = text;
    setText('');
    void ask('question', q);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeAssistant();
    }
  };

  return (
    <aside ref={panelRef} id="capcom-panel" className="capcom" aria-labelledby="capcom-title" hidden={!visible} onKeyDown={onKeyDown}>
      <div className="capcom-head">
        <div className="capcom-brand-mark"><AstronautMark size={40} /></div>
        <div className="capcom-id">
          <span className="capcom-eyebrow">Mission health assistant</span>
          <h2 className="capcom-title" id="capcom-title">{APP_NAME}</h2>
          <span className={`capcom-link${linkUp ? ' is-up' : ''}`}>
            {linkUp ? 'Link: online' : 'Link: offline — built-in guidance'}
          </span>
        </div>
        <button className="btn btn-ghost capcom-close" onClick={closeAssistant} aria-label={`Close ${APP_NAME}`}>
          Close
        </button>
      </div>
      <div className="capcom-context" aria-live="polite">
        {contextText} selected
      </div>
      <div className="capcom-log" ref={logRef} role="log" aria-live="polite" aria-busy={busy}>
        {log.map((e) =>
          e.sender === 'CAPCOM' ? (
            <CapcomMessage key={e.id} entry={e} onFollowup={followup} disabled={busy} />
          ) : e.sender === 'CREW' ? (
            <article key={e.id} className="capcom-msg capcom-msg-crew">
              <div className="capcom-meta">
                <span className="capcom-met">{e.met}</span>
                <span className="capcom-sender">CREW</span>
              </div>
              <p className="capcom-crew-text">{e.text}</p>
            </article>
          ) : (
            <p key={e.id} className="capcom-system">{e.text}</p>
          ),
        )}
        {busy && (
          <div className="capcom-msg capcom-msg-capcom capcom-typing" aria-label={`${APP_NAME} is typing`}>
            <AstronautMark size={30} className="capcom-avatar" />
            <p className="capcom-reply">
              {APP_NAME} is typing<span className="capcom-dots" aria-hidden="true"><i /><i /><i /></span>
            </p>
          </div>
        )}
      </div>
      <div className="capcom-quick" role="group" aria-label="Quick actions">
        {QUICK_ACTIONS.map((q) => (
          <button key={q.id} className="btn capcom-qa" disabled={busy} onClick={() => void ask(q.id, q.label)}>
            {q.label}
          </button>
        ))}
      </div>
      <form className="capcom-form" onSubmit={onSubmit}>
        <label className="visually-hidden" htmlFor="capcom-input">Question for {APP_NAME}</label>
        <input
          id="capcom-input"
          ref={inputRef}
          value={text}
          maxLength={600}
          autoComplete="off"
          placeholder={`Ask ${APP_NAME} about your health…`}
          onChange={(ev) => setText(ev.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
