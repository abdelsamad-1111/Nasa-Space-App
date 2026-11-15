import { FORECAST_LABEL } from '../brain/forecast';
import { FORECAST_RESULTS as R } from '../data/forecastResults';
import { fmtNumber } from '../lib/format';
import { useApp } from '../state/AppState';
import './forecast.css';

function CompareBars({ title, episodes, model, rules }: { title: string; episodes: number; model: number; rules: number }) {
  const row = (who: string, n: number, kind: 'model' | 'rules') => (
    <div className={`fc-bar-row fc-${kind}`}>
      <span className="fc-bar-who">{who}</span>
      <span className="fc-bar" role="img" aria-label={`${who}: ${n} of ${episodes}`}>
        <span style={{ width: `${(n / episodes) * 100}%` }} />
      </span>
      <span className="fc-bar-n num">{fmtNumber(n)}/{fmtNumber(episodes)}</span>
    </div>
  );
  return (
    <div className="fc-compare">
      <h3>{title}</h3>
      {row('Model (early warning)', model, 'model')}
      {row('Rules (current alerts)', rules, 'rules')}
    </div>
  );
}

/** Plain explainer of the early-warning model. All numbers come from forecast-evaluation.json (scenario A). */
export function ForecastScreen() {
  const { setScreen } = useApp();
  return (
    <main className="screen forecast-page">
      <div className="screen-title">
        <h1>How the forecast works</h1>
        <button className="btn btn-ghost" onClick={() => setScreen('twin')}>← Back to Health Twin</button>
      </div>
      <p className="fc-lead">
        The “Next 48 h” card is an early warning from a small statistical model. It runs in the app and looks at the
        same morning readings you already take. It never changes the OK / Watch / Act status, which still comes only from the app rules.
      </p>

      <ol className="fc-steps">
        <li>
          <span className="fc-step-n num">1</span>
          <div>
            <h2>What it reads</h2>
            <p>Today’s change from your own last 14 days, and the change over 2 days — for temperature, heart rate, blood pressure, oxygen, sleep and mood.</p>
          </div>
        </li>
        <li>
          <span className="fc-step-n num">2</span>
          <div>
            <h2>What it predicts</h2>
            <p>Whether an infection or a fluid-loss peak is likely in the next 2 days, and which of the two is more likely.</p>
          </div>
        </li>
        <li>
          <span className="fc-step-n num">3</span>
          <div>
            <h2>How it was tested</h2>
            <p>Trained on a separate synthetic crew (200 people), tested on 20 unseen ones.</p>
          </div>
        </li>
      </ol>

      <section className="section fc-results" aria-labelledby="fc-results-title">
        <div className="section-head">
          <h2 id="fc-results-title">Results on the test crew</h2>
          <span className="hint">Scenario {R.scenario}: {R.scenarioTitle} · Test crew: {R.testCrew}</span>
        </div>
        <CompareBars
          title="Warned before the peak — infection"
          episodes={R.infection.episodes}
          model={R.infection.modelWarnedBeforePeak}
          rules={R.infection.rulesAlertedBeforePeak}
        />
        <CompareBars
          title="Warned before the peak — fluid loss"
          episodes={R.fluidLoss.episodes}
          model={R.fluidLoss.modelWarnedBeforePeak}
          rules={R.fluidLoss.rulesAlertedBeforePeak}
        />
        <p className="fc-false">
          False warnings on normal days: <strong className="num">{fmtNumber(R.normalDayWarningPct, 1)}%</strong>
          <span className="hint"> ({fmtNumber(R.normalDayWarnings)} of {fmtNumber(R.normalDays)} normal days)</span>
        </p>
        <p className="hint fc-legend">Dashed bar = model (forecast) · solid bar = current rule-based alerts. Numbers are read from {R.source}.</p>
      </section>

      <p className="fc-honest">
        <strong>Honest note:</strong> Trained and tested on synthetic, research-based data. Not real-world accuracy.
        With real crew data the same steps would be repeated.
      </p>
      <p className="hint">{FORECAST_LABEL} {R.label}</p>
    </main>
  );
}
