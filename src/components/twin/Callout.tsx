import { forwardRef, memo } from 'react';
import { CARD_LABEL, CARD_LABEL_DUAL, THRESHOLDS, fmtMinutes, metricDef, type MetricId, type Status, type ZoneDef } from '../../brain/indicators';
import { exercisePct, worst, type Evaluation } from '../../brain/evaluate';
import { StatusBadge } from '../StatusBadge';
import { fmtNumber, fmtPct, fmtValue } from '../../lib/format';

type Metrics = Partial<Record<MetricId, Evaluation>>;

interface Props {
  zone: ZoneDef;
  metrics: Metrics;
  cumulativeDose: number;
  limit: number;
  selected: boolean;
  hovered: boolean;
  onOpen: (id: MetricId) => void;
  onHover: (zone: string | null) => void;
}

export function zoneStatus(zone: ZoneDef, metrics: Metrics): Status | null {
  const list = zone.indicators.map((id) => metrics[id]?.status).filter(Boolean) as Status[];
  return list.length ? worst(...list) : null;
}

/** Metric that needs the most attention in a zone (opened when the card itself is clicked). */
export function zoneLead(zone: ZoneDef, metrics: Metrics): MetricId {
  let lead = zone.indicators[0];
  const r = (id: MetricId) => ['OK', 'WATCH', 'ACT', 'CRITICAL'].indexOf(metrics[id]?.status ?? 'OK');
  for (const id of zone.indicators) if (r(id) > r(lead)) lead = id;
  return lead;
}

function arrow(p: number | null) {
  if (p === null) return '';
  const r = Math.round(p);
  return r > 0 ? '↑' : r < 0 ? '↓' : '→';
}

/** One value block: [label] [big value + unit] [↑/↓ % vs baseline]. */
function ValueBlock({ id, e, dual, cumulativeDose, limit }: { id: MetricId; e?: Evaluation; dual: boolean; cumulativeDose: number; limit: number }) {
  const ind = metricDef(id);
  let value = '—';
  let unit = '';
  let sub = 'No reading';
  if (e) {
    if (id === 'radiation') {
      value = fmtNumber(cumulativeDose, 1);
      unit = `/ ${fmtNumber(limit)} mSv`;
      sub = `Today ${fmtValue(id, e.value)} mSv`;
    } else if (id === 'exercise') {
      value = fmtMinutes(e.value as number);
      unit = '';
      sub = `${fmtNumber(exercisePct(e.value as number))}% of ${fmtMinutes(THRESHOLDS.exercise.targetMin)}`;
    } else {
      value = fmtValue(id, e.value);
      unit = ind.unit;
      sub = e.deltaPct === null ? 'No baseline' : `${arrow(e.deltaPct)} ${fmtPct(e.deltaPct)}${dual ? '' : ' vs baseline'}`;
    }
  }
  // Two values side by side: the unit moves into the label so both values fit.
  const label = dual && unit ? `${CARD_LABEL_DUAL[id] ?? CARD_LABEL[id]} (${unit})` : CARD_LABEL[id];
  return (
    <>
      <span className="cv-label">{label}</span>
      <span className="cv-value num">
        {value}
        {unit && !dual && <span className="cv-unit"> {unit}</span>}
      </span>
      <span className="cv-sub num">{sub}</span>
    </>
  );
}

export const Callout = memo(
  forwardRef<HTMLDivElement, Props>(function Callout(
    { zone, metrics, cumulativeDose, limit, selected, hovered, onOpen, onHover },
    ref,
  ) {
    const status = zoneStatus(zone, metrics);
    const problem = status !== null && status !== 'OK';
    const dual = zone.indicators.length > 1;
    const cls = [
      'card',
      `card-${zone.side}`,
      problem ? `card-alert card-${status}` : 'card-quiet',
      hovered ? 'is-hover' : '',
      selected ? 'is-selected' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={cls}
        data-zone={zone.id}
        onMouseEnter={() => onHover(zone.id)}
        onMouseLeave={() => onHover(null)}
        onClick={(ev) => {
          if ((ev.target as HTMLElement).closest('button')) return;
          onOpen(zoneLead(zone, metrics));
        }}
      >
        <div className="card-head">
          <span className="card-name">{zone.name}</span>
          {status ? <StatusBadge status={status} size={10} /> : <span className="muted card-nodata">No data</span>}
        </div>
        <div className={`card-values${dual ? ' is-dual' : ''}`}>
          {zone.indicators.map((id) => {
            const e = metrics[id];
            const ind = metricDef(id);
            return (
              <button
                key={id}
                className="card-value"
                onClick={() => onOpen(id)}
                onFocus={() => onHover(zone.id)}
                onBlur={() => onHover(null)}
                aria-label={`${zone.name}, ${ind.name}${e ? `: status ${e.status}` : ': no reading'}. Open details.`}
              >
                <ValueBlock id={id} e={e} dual={dual} cumulativeDose={cumulativeDose} limit={limit} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }),
);
