import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoState, emptyState, loadState, saveState } from './storage';

describe('Mission provenance and saved-data migration', () => {
  let stored: string | null;
  beforeEach(() => {
    stored = null;
    vi.stubGlobal('window', { localStorage: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; },
      removeItem: () => { stored = null; },
    } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adds the demo follow-up actions to saved demo missions only', () => {
    const oldDemo = { ...demoState(), actionsTaken: [] };
    stored = JSON.stringify(oldDemo);
    expect(loadState().state.actionsTaken.map((a) => a.missionDay)).toEqual([18, 18, 19, 19]);
    saveState(emptyState());
    expect(loadState().state.actionsTaken).toEqual([]);
  });

  it('keeps demo and personal missions distinct after save and reload', () => {
    saveState(emptyState());
    expect(loadState().state.mode).toBe('personal');
    saveState(demoState());
    expect(loadState().state.mode).toBe('demo');
  });

  it('never uses the sample astronaut’s baselines for a new personal mission', () => {
    const personal = emptyState();
    expect(personal.settings.baselines).toEqual({});
    expect(demoState().settings.baselines).not.toEqual({});
    saveState(personal);
    expect(loadState().state.settings.baselines).toEqual({});
  });

  it('recognizes a legacy all-demo mission without removing its readings', () => {
    const { mode: _mode, ...legacy } = demoState();
    stored = JSON.stringify(legacy);
    const restored = loadState().state;
    expect(restored.mode).toBe('demo');
    expect(restored.measurements).toEqual(legacy.measurements);
  });

  it('does not inject sample exercise or scenario events into legacy personal or mixed data', () => {
    const { mode: _mode, ...legacy } = demoState();
    const measurements = [legacy.measurements[0], { ...legacy.measurements[1], id: 'ci-personal-hr' }];
    stored = JSON.stringify({ ...legacy, measurements });
    const restored = loadState().state;
    expect(restored.mode).toBe('personal');
    expect(restored.measurements).toEqual(measurements);
    saveState(emptyState());
    expect(loadState().state.measurements).toEqual([]);
  });

  it('preserves an explicit personal mode even if old sample readings remain', () => {
    saveState({ ...demoState(), mode: 'personal' });
    expect(loadState().state.mode).toBe('personal');
  });
});
