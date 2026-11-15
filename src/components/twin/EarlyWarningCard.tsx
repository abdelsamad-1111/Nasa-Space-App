import type { Location } from '../../brain/indicators';
import { FORECAST_LABEL } from '../../brain/forecast';
import { forecastHeadline, forecastLocationNote, type ForecastPresentation } from '../../lib/forecastPresentation';
import './earlyWarning.css';

interface Props {
  forecast: ForecastPresentation | null;
  location?: Location;
  onHowItWorks?: () => void;
}

/** "Next 48 h · early warning" — DASHED card (forecast); the solid "Now" card sits next to it. */
export function EarlyWarningCard({ forecast, location = 'ISS', onHowItWorks }: Props) {
  const note = forecastLocationNote(forecast, location);
  return (
    <section className={`nn-card nn-next${forecast?.warn ? ' has-warning' : ''}`} aria-labelledby="early-warning-title">
      <div className="nn-head">
        <h2 id="early-warning-title" className="eyebrow">Next 48 h · early warning</h2>
        {onHowItWorks && (
          <button type="button" className="nn-link" onClick={onHowItWorks}>How it works</button>
        )}
      </div>
      {forecast ? (
        <>
          <div className="early-warning-risk">
            <span
              className="early-warning-bar"
              role="img"
              aria-label={`Early-warning risk ${forecast.riskPercent}%`}
            >
              <span style={{ width: `${forecast.risk * 100}%` }} />
            </span>
            <span className="early-warning-pct num">{forecast.riskPercent}%</span>
            <strong className="early-warning-level">{forecastHeadline(forecast)}</strong>
          </div>
          {forecast.warn && (
            <div className="early-warning-detail">
              {forecast.drivers.length > 0 && (
                <p className="early-warning-why">
                  <span className="nn-label">Why:</span> {forecast.drivers.join(' · ')}
                </p>
              )}
              <div className="early-warning-todo">
                <span className="nn-label">Do today:</span>{' '}
                <ul>
                  {forecast.doToday.slice(0, 3).map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
              {note && <p className="early-warning-note">{note}</p>}
            </div>
          )}
        </>
      ) : (
        <p className="early-warning-missing">No forecast — morning check-in missing</p>
      )}
      <p className="early-warning-caption">{FORECAST_LABEL}</p>
    </section>
  );
}
