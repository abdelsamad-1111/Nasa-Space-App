import { INDICATORS, LOCATION_LABEL, PATTERNS, ZONES, type PatternId, type ZoneId } from '../../brain/indicators';
import { escalationText, type PatternHit } from '../../brain/evaluate';
import { useApp } from '../../state/AppState';
import { StatusBadge } from '../StatusBadge';
import { fmtValue } from '../../lib/format';

/** Zones (organs) linked to a pattern, via its indicators. */
export function patternZones(id: PatternId): ZoneId[] {
  const inds = PATTERNS[id].indicators;
  return ZONES.filter((z) => z.indicators.some((m) => (inds as string[]).includes(m))).map((z) => z.id);
}

interface Props {
  patterns: PatternHit[];
  active: PatternId | null;
  onToggle: (id: PatternId) => void;
}

/**
 * Full-width banner above the body: pattern name, the linked readings and the
 * escalation text for the current location. Clicking it highlights the linked organs.
 */
export function PatternBanner({ patterns, active, onToggle }: Props) {
  const { data, view } = useApp();
  if (!patterns.length) return null;
  const loc = data.settings.location;
  return (
    <div className="patterns" data-region="followup">
      {patterns.map((p) => {
        const def = PATTERNS[p.id];
        const status = p.escalate ? 'ACT' : 'WATCH';
        const on = active === p.id;
        return (
          <button
            key={p.id}
            type="button"
            className={`pattern-banner pattern-${status}${on ? ' is-active' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(p.id)}
          >
            <span className="pb-head">
              <span className="eyebrow pb-eyebrow">Pattern detected</span>
              <StatusBadge status={status} size={11} />
              <span className="pb-title">{def.title}</span>
              <span className="pb-hint">{on ? 'Linked organs highlighted — click to clear' : 'Click to highlight the linked organs'}</span>
            </span>
            <span className="pb-readings">
              {def.indicators.map((id) => {
                const e = view.evals[id];
                return (
                  <span key={id} className="pb-reading">
                    <span className="pb-name">{INDICATORS[id].name}</span>
                    <span className="pb-value num">
                      {e ? `${fmtValue(id, e.value)} ${INDICATORS[id].unit}` : 'previous day'}
                    </span>
                    {e && <StatusBadge status={e.status} size={9} />}
                  </span>
                );
              })}
            </span>
            <span className="pb-actions">{def.actions.map((a, i) => `${i + 1}. ${a}`).join('   ')}</span>
            {p.escalate && (
              <span className="pb-escalation">
                <span className="eyebrow">Escalation · {LOCATION_LABEL[loc]}</span> {escalationText(loc)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
