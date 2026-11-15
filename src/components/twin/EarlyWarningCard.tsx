import type { ForecastPresentation } from '../../lib/forecastPresentation';
import { FORECAST_LABEL } from '../../brain/forecast';
import './earlyWarning.css';

export function EarlyWarningCard({ forecast }: { forecast: ForecastPresentation | null }) {
  return (
    <section className={`early-warning${forecast?.warn ? ' has-warning' : ''}`} aria-labelledby="early-warning-title">
      <h2 id="early-warning-title">Early warning <span>(next 2 days)</span></h2>
      {forecast ? <>
        <div className="early-warning-risk">
          <span className="early-warning-bar" aria-hidden="true">
            <span style={{ width: `${forecast.risk * 100}%` }} />
          </span>
          <strong>{forecast.level}</strong>
        </div>
        {forecast.warn && <>
          <p className="early-warning-problem">{forecast.problemLabel}</p>
          {forecast.drivers.length > 0 && <ul className="early-warning-drivers">
            {forecast.drivers.map((driver) => <li key={driver}>{driver}</li>)}
          </ul>}
        </>}
      </> : <p className="early-warning-missing">No forecast — check-in missing</p>}
      <p className="early-warning-caption">{FORECAST_LABEL}</p>
    </section>
  );
}
