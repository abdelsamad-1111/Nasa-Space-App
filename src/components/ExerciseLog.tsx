import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LOCATION_LABEL, THRESHOLDS, fmtMinutes } from '../brain/indicators';
import { dailyValue, exercisePct, exerciseStatus } from '../brain/evaluate';
import { EXERCISE_INPUT_ERROR, exerciseMeasurement, parseExerciseMinutes } from '../lib/exerciseLog';
import { fmtNumber } from '../lib/format';
import { useApp } from '../state/AppState';
import { Footer } from './Footer';
import { StatusBadge } from './StatusBadge';
import './checkin.css';

export function ExerciseLog() {
  const { data, dispatch, today, setDay, setScreen } = useApp();
  const previous = dailyValue(data.measurements, 'exercise', today);
  const [raw, setRaw] = useState(() => typeof previous?.value === 'number' ? String(previous.value) : '');
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const saved = useRef(false);
  const minutes = parseExerciseMinutes(raw);
  const target = THRESHOLDS.exercise.targetMin;
  const hasInvalidValue = raw.trim() !== '' && minutes === null;
  const shownError = error ?? (hasInvalidValue ? EXERCISE_INPUT_ERROR : null);

  useEffect(() => headingRef.current?.focus(), []);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (saved.current) return;
    if (minutes === null) {
      setError(EXERCISE_INPUT_ERROR);
      inputRef.current?.focus();
      return;
    }
    const measurement = exerciseMeasurement({ minutes, missionDay: today, previous, savedAt: new Date() });
    saved.current = true;
    dispatch({ type: 'addMeasurements', measurements: [measurement] });
    setDay(today);
    setScreen('twin');
  };

  return (
    <div className="checkin exercise-log">
      <header className="ci-top">
        <div>
          <span className="eyebrow">Daily exercise · Mission day {fmtNumber(today)} · {LOCATION_LABEL[data.settings.location]}</span>
          <h1 ref={headingRef} tabIndex={-1} className="ci-title">Log leg exercise</h1>
        </div>
        <button className="btn" onClick={() => setScreen('twin')}>Cancel</button>
      </header>
      <main className="exercise-log-body">
        <section className="exercise-log-form" aria-labelledby="exercise-total-title">
          <h2 className="ci-ind" id="exercise-total-title">Time exercised today</h2>
          <p id="exercise-help" className="exercise-log-help">Enter your total minutes completed today, including resistance and treadmill exercise. Updating this value replaces today’s total; it does not add another session.</p>
          <form onSubmit={save} noValidate>
            <div className="ci-field">
              <label htmlFor="exercise-minutes" className="legend-like">Total minutes today</label>
              <div className="bp-inputs">
                <input
                  ref={inputRef}
                  id="exercise-minutes"
                  className="input ci-input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={raw}
                  aria-invalid={!!shownError}
                  aria-describedby={`exercise-help exercise-range${shownError ? ' exercise-error' : ''}`}
                  onChange={(event) => { setRaw(event.target.value); setError(null); }}
                />
                <span className="ci-unit">min</span>
              </div>
              <p className="hint ci-note" id="exercise-range">0–1,440 minutes. Enter 0 if you have not exercised today.</p>
              {shownError && <p className="field-error ci-note" id="exercise-error" role="alert">{shownError}</p>}
            </div>
            <div className="exercise-log-target">
              <span className="eyebrow">App planning target</span>
              <strong>{fmtMinutes(target)}</strong>
              {minutes !== null && (
                <div className="exercise-log-preview" aria-live="polite">
                  <StatusBadge status={exerciseStatus(minutes)} />
                  <span>{fmtNumber(exercisePct(minutes))}% of target</span>
                </div>
              )}
            </div>
            <button className="btn btn-primary ci-action" type="submit">Save daily total</button>
          </form>
          <p className="hint exercise-log-note">Your mission exercise plan takes priority. Exercise is tracked separately from your eight health indicators.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
