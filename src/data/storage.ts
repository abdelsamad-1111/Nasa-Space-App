// VITALS-ORBIT — localStorage persistence. Every read/write is wrapped in try/catch.
import type { Measurement, Settings } from '../brain/evaluate';
import { DEMO_SETTINGS, defaultMissionStart, generateDemoMission } from './demo';

// v2: demo with evening dosimeter checks and the days 15–17 streak break.
const KEY = 'vitals-orbit:v2';

export interface ActionTaken {
  key: string; // `${scope}-${day}-${index}`
  missionDay: number;
  label: string;
  timestamp: string;
}

export interface PersistedState {
  mode: 'demo' | 'personal';
  settings: Settings;
  missionStart: string;
  measurements: Measurement[];
  acknowledgedAlerts: string[];
  actionsTaken: ActionTaken[];
}

export function demoState(today = new Date()): PersistedState {
  const missionStart = defaultMissionStart(today);
  return {
    mode: 'demo',
    settings: structuredClone(DEMO_SETTINGS),
    missionStart,
    measurements: generateDemoMission(missionStart),
    acknowledgedAlerts: [],
    actionsTaken: [],
  };
}

export function emptyState(today = new Date()): PersistedState {
  return {
    mode: 'personal',
    settings: { ...structuredClone(DEMO_SETTINGS), name: 'Astronaut', baselines: {} },
    missionStart: (() => {
      const d = new Date(today);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    })(),
    measurements: [],
    acknowledgedAlerts: [],
    actionsTaken: [],
  };
}

/** Older saved demo data has no exercise minutes: add them from the demo generator. */
function addDemoExercise(s: PersistedState): PersistedState {
  const isDemo = s.mode === 'demo';
  const hasExercise = s.measurements.some((m) => m.indicatorId === 'exercise');
  if (!isDemo || hasExercise) return s;
  const extra = generateDemoMission(s.missionStart).filter((m) => m.indicatorId === 'exercise');
  return { ...s, measurements: [...s.measurements, ...extra] };
}

type SavedState = Omit<PersistedState, 'mode'> & { mode?: unknown };

function isValid(s: unknown): s is SavedState {
  if (!s || typeof s !== 'object') return false;
  const o = s as SavedState;
  return (
    Array.isArray(o.measurements) &&
    typeof o.missionStart === 'string' &&
    !!o.settings &&
    typeof o.settings.careerRadiationLimit === 'number' &&
    Array.isArray(o.acknowledgedAlerts) &&
    Array.isArray(o.actionsTaken)
  );
}

/** Old mixed/empty missions default to personal so scenario events cannot leak into them. */
function restoreState(saved: SavedState): PersistedState {
  const mode = saved.mode === 'demo' || saved.mode === 'personal'
    ? saved.mode
    : saved.measurements.length > 0 && saved.measurements.every((m) => typeof m?.id === 'string' && m.id.startsWith('demo-'))
      ? 'demo'
      : 'personal';
  return addDemoExercise({ ...saved, mode });
}

/** Load saved state; on first open (or unreadable storage) load the demo mission. */
export function loadState(): { state: PersistedState; firstOpen: boolean } {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValid(parsed)) return { state: restoreState(parsed), firstOpen: false };
    }
  } catch {
    // storage blocked or corrupt — fall through to demo data
  }
  return { state: demoState(), firstOpen: true };
}

export function saveState(state: PersistedState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked — the app keeps working in memory
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
