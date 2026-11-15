import { memo } from 'react';
import { useApp } from '../../state/AppState';
import { AssessmentStatus } from '../AssessmentStatus';
import { fmtNumber } from '../../lib/format';
import { EarlyWarningCard } from './EarlyWarningCard';

/** NOW (solid, rule-based status) next to NEXT 48 H (dashed, forecast). Both follow the timeline day and location. */
export const NowNextStrip = memo(function NowNextStrip() {
  const { view, data, setScreen } = useApp();
  const pattern = view.patterns[0];
  return (
    <div className="nn-strip" aria-label="Now and next 48 hours">
      <section className="nn-card nn-now" aria-labelledby="nn-now-title">
        <div className="nn-head">
          <h2 id="nn-now-title" className="eyebrow">Now · Day {fmtNumber(view.day)}</h2>
        </div>
        <div className="nn-now-status">
          <AssessmentStatus summary={view.assessment} size={16} />
        </div>
        <p className="nn-now-attention">
          {view.attention === 0
            ? view.assessment.complete ? 'All measured indicators are OK.' : 'Record the missing indicators to complete this assessment.'
            : `${fmtNumber(view.attention)} indicator${view.attention === 1 ? '' : 's'} need${view.attention === 1 ? 's' : ''} attention`}
        </p>
        {pattern && <p className="nn-now-pattern">Pattern: {pattern.title.toLowerCase()}</p>}
      </section>
      <EarlyWarningCard forecast={view.forecast} location={data.settings.location} onHowItWorks={() => setScreen('forecast')} />
    </div>
  );
});
