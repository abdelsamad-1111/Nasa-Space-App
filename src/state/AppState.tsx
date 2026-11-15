import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import {
  buildAlerts,
  cumulativeDose,
  detectPatterns,
  evaluateDay,
  evaluateExerciseOnDay,
  summarizeAssessment,
  type AssessmentSummary,
  type Alert,
  type Evaluation,
  type Measurement,
  type PatternHit,
  type Settings,
} from '../brain/evaluate';
import type { IndicatorId, MetricId, Status } from '../brain/indicators';
import { MISSION_LENGTH, missionDayFor } from '../data/demo';
import { clearState, demoState, emptyState, loadState, saveState, type PersistedState } from '../data/storage';

type Action =
  | { type: 'settings'; settings: Settings }
  | { type: 'addMeasurements'; measurements: Measurement[] }
  | { type: 'ackAlert'; id: string }
  | { type: 'toggleAction'; key: string; missionDay: number; label: string }
  | { type: 'replace'; state: PersistedState };

function reducer(s: PersistedState, a: Action): PersistedState {
  switch (a.type) {
    case 'settings':
      return { ...s, settings: a.settings };
    case 'addMeasurements':
      return { ...s, measurements: [...s.measurements, ...a.measurements] };
    case 'ackAlert':
      return s.acknowledgedAlerts.includes(a.id) ? s : { ...s, acknowledgedAlerts: [...s.acknowledgedAlerts, a.id] };
    case 'toggleAction': {
      const exists = s.actionsTaken.some((x) => x.key === a.key);
      return {
        ...s,
        actionsTaken: exists
          ? s.actionsTaken.filter((x) => x.key !== a.key)
          : [...s.actionsTaken, { key: a.key, missionDay: a.missionDay, label: a.label, timestamp: new Date().toISOString() }],
      };
    }
    case 'replace':
      return a.state;
  }
}

export type Screen = 'twin' | 'checkin' | 'exercise' | 'alerts' | 'settings' | 'sources';

export interface DayView {
  day: number;
  evals: Partial<Record<IndicatorId, Evaluation>>;
  /** The 8 indicators plus leg exercise (Legs zone). */
  metrics: Partial<Record<MetricId, Evaluation>>;
  patterns: PatternHit[];
  overall: Status | null;
  assessment: AssessmentSummary;
  attention: number;
  cumulativeDose: number;
}

interface Ctx {
  data: PersistedState;
  dispatch: (a: Action) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
  selectedMetric: MetricId | null;
  setSelectedMetric: (id: MetricId | null) => void;
  /** Open the morning check-in, optionally at a given step (0–7). */
  startCheckIn: (step?: number) => void;
  startExerciseLog: () => void;
  checkInStep: number;
  /** Real clock, refreshed every minute (routine reminders). */
  now: Date;
  day: number;
  setDay: (d: number) => void;
  today: number;
  maxDay: number;
  view: DayView;
  alerts: Alert[];
  openAlerts: Alert[];
  loadDemo: () => void;
  resetAll: () => void;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function AppProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadState);
  const [data, dispatch] = useReducer(reducer, initial.state);
  const [screen, setScreen] = useState<Screen>('twin');
  const [selectedMetric, setSelectedMetric] = useState<MetricId | null>(null);
  const [checkInStep, setCheckInStep] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const startCheckIn = useCallback((step = 0) => {
    setCheckInStep(step);
    setScreen('checkin');
  }, []);
  const startExerciseLog = useCallback(() => {
    setSelectedMetric('exercise');
    setScreen('exercise');
  }, []);

  const today = Math.max(1, missionDayFor(data.missionStart));
  const lastDataDay = data.measurements.reduce((m, x) => Math.max(m, x.missionDay), 0);
  const maxDay = Math.max(MISSION_LENGTH, today, lastDataDay);
  const [day, setDayRaw] = useState(() => clamp(today, 1, maxDay));
  const setDay = useCallback((d: number) => setDayRaw(clamp(Math.round(d), 1, maxDay)), [maxDay]);

  useEffect(() => saveState(data), [data]);
  // New readings count for today's routine immediately.
  useEffect(() => setNow(new Date()), [data.measurements]);

  const view = useMemo<DayView>(() => {
    const evals = evaluateDay(data.measurements, day, data.settings);
    const patterns = detectPatterns(data.measurements, day);
    const exercise = evaluateExerciseOnDay(data.measurements, day);
    const assessment = summarizeAssessment(evals, patterns);
    return {
      day,
      evals,
      metrics: exercise ? { ...evals, exercise } : evals,
      patterns,
      overall: assessment.status,
      assessment,
      attention: assessment.attention,
      cumulativeDose: cumulativeDose(data.measurements, day),
    };
  }, [data.measurements, data.settings, day]);

  const alerts = useMemo(
    () => buildAlerts(data.measurements, day, data.settings, data.acknowledgedAlerts),
    [data.measurements, data.settings, data.acknowledgedAlerts, day],
  );
  const openAlerts = useMemo(() => alerts.filter((a) => a.open), [alerts]);

  const loadDemo = useCallback(() => {
    const s = demoState();
    dispatch({ type: 'replace', state: s });
    setSelectedMetric(null);
    setDayRaw(Math.max(1, missionDayFor(s.missionStart)));
    setScreen('twin');
  }, []);

  const resetAll = useCallback(() => {
    clearState();
    const s = emptyState();
    dispatch({ type: 'replace', state: s });
    setSelectedMetric(null);
    setDayRaw(1);
  }, []);

  const value: Ctx = {
    data,
    dispatch,
    screen,
    setScreen,
    selectedMetric,
    setSelectedMetric,
    startCheckIn,
    startExerciseLog,
    checkInStep,
    now,
    day,
    setDay,
    today,
    maxDay,
    view,
    alerts,
    openAlerts,
    loadDemo,
    resetAll,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
