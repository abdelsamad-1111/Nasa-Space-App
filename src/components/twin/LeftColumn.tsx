import { memo } from 'react';
import { INDICATOR_ORDER, INDICATORS, LOCATION_LABEL, type MetricId } from '../../brain/indicators';
import { useApp } from '../../state/AppState';
import { StatusBadge, StatusLegend } from '../StatusBadge';
import { AssessmentStatus } from '../AssessmentStatus';
import { fmtDate, fmtNumber, fmtValue } from '../../lib/format';
import { radiationValue } from './values';
import { RoutineBlock } from './RoutineBlock';

function initials(name: string): string {
  const words = name.replace(/^Astronaut\s+/i, '').split(/[\s.]+/).filter(Boolean);
  return (words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '');
}

interface Props {
  selected: MetricId;
  onSelect: (id: MetricId) => void;
}

export const LeftColumn = memo(function LeftColumn({ selected, onSelect }: Props) {
  const { data, view, maxDay, startExerciseLog } = useApp();
  const { settings, missionStart } = data;
  const dayDate = new Date(new Date(missionStart).getTime() + (view.day - 1) * 86400000);

  return (
    <aside className="left-col" aria-label="Astronaut and indicators">
      <div className="astro">
        <div className="astro-initials" aria-hidden="true">{initials(settings.name).toUpperCase()}</div>
        <div>
          <div className="astro-name">{settings.name}</div>
          <div className="muted">
            Mission day <span className="num">{fmtNumber(view.day)}</span> of <span className="num">{fmtNumber(maxDay)}</span> ·{' '}
            {LOCATION_LABEL[settings.location]}
          </div>
          <div className="muted num">{fmtDate(dayDate)}</div>
          <div className="mission-mode">{data.mode === 'demo' ? 'Demo mission · sample data' : data.measurements.some((m) => m.id.startsWith('demo-')) ? 'Personal mission · includes sample data' : 'Personal mission'}</div>
        </div>
      </div>

      <div className="overall">
        <div className="eyebrow">Overall status</div>
        <div className="overall-status">
          <AssessmentStatus summary={view.assessment} size={16} />
        </div>
        <div className="muted">
          {view.attention === 0
            ? view.assessment.complete ? 'All measured indicators are OK.' : 'Record the missing indicators to complete this assessment.'
            : `${fmtNumber(view.attention)} indicator${view.attention === 1 ? '' : 's'} need${view.attention === 1 ? 's' : ''} attention`}
        </div>
      </div>

      <RoutineBlock />
      <button className="btn" onClick={startExerciseLog}>Log today’s exercise</button>

      <div className="ind-list" data-region="measure">
        <div className="eyebrow ind-list-head">Indicators · Day {fmtNumber(view.day)}</div>
        <ul>
          {INDICATOR_ORDER.map((id) => {
            const e = view.evals[id];
            const ind = INDICATORS[id];
            const value =
              id === 'radiation' && e
                ? radiationValue(view.cumulativeDose, settings.careerRadiationLimit)
                : e
                  ? `${fmtValue(id, e.value)} ${ind.unit}`
                  : '—';
            return (
              <li key={id}>
                <button
                  className={`ind-row${selected === id ? ' is-selected' : ''}`}
                  aria-pressed={selected === id}
                  onClick={() => onSelect(id)}
                >
                  <span className="ind-name">{ind.name}</span>
                  <span className="ind-value num">{value}</span>
                  <span className="ind-status">
                    {e ? <StatusBadge status={e.status} size={10} /> : <span className="muted">No data</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <StatusLegend />
      </div>
    </aside>
  );
});
