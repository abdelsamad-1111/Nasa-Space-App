import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INDICATOR_ORDER, ZONES, type IndicatorId, type MetricId, type PatternId, type Status, type StoryStepId, type ZoneId } from '../../brain/indicators';
import { detectPatterns, evaluateDay, summarizeAssessment, rank } from '../../brain/evaluate';
import { useApp } from '../../state/AppState';
import { fmtDate, fmtNumber } from '../../lib/format';
import { LeftColumn } from './LeftColumn';
import { BodyStage } from './BodyStage';
import { SidePanel, type PanelTab } from './SidePanel';
import { PatternBanner, patternZones } from './PatternCard';
import { Timeline } from './Timeline';
import { StoryBar } from './StoryBar';
import './twin.css';

function worstIndicator(evals: ReturnType<typeof evaluateDay>): IndicatorId {
  let best: IndicatorId = 'bp';
  let r = -1;
  for (const id of INDICATOR_ORDER) {
    const e = evals[id];
    if (e && rank(e.status) > r) {
      r = rank(e.status);
      best = id;
    }
  }
  return best;
}

export function TwinScreen() {
  const { data, view, maxDay, selectedMetric, setSelectedMetric } = useApp();
  const selected = selectedMetric ?? worstIndicator(view.evals);
  const [tab, setTab] = useState<PanelTab>('overview');
  const [hoverZone, setHoverZone] = useState<ZoneId | null>(null);
  const [story, setStory] = useState<StoryStepId | null>(null);
  const [activePattern, setActivePattern] = useState<PatternId | null>(null);
  // Clear the highlight when the pattern is no longer active on the selected day.
  const shownPattern = activePattern && view.patterns.some((p) => p.id === activePattern) ? activePattern : null;
  const highlight = useMemo(() => (shownPattern ? patternZones(shownPattern) : []), [shownPattern]);
  const togglePattern = useCallback((id: PatternId) => setActivePattern((cur) => (cur === id ? null : id)), []);
  const storyTimer = useRef<number>();

  // Overall status for every day (timeline ticks).
  const dayStatus = useMemo<(Status | null)[]>(() => {
    const out: (Status | null)[] = [];
    for (let d = 1; d <= maxDay; d++) {
      const evals = evaluateDay(data.measurements, d, data.settings);
      const summary = summarizeAssessment(evals, detectPatterns(data.measurements, d));
      out.push(summary.complete || summary.status !== 'OK' ? summary.status : null);
    }
    return out;
  }, [data.measurements, data.settings, maxDay]);

  const open = useCallback((id: MetricId) => {
    setSelectedMetric(id);
    setTab('overview');
    document.getElementById('side-panel')?.focus({ preventScroll: true });
  }, [setSelectedMetric]);

  const onStep = useCallback((id: StoryStepId) => {
    setStory(id);
    if (id === 'compare') setTab('trend');
    if (id === 'interpret') setTab('why');
    if (id === 'followup' || id === 'measure') setTab('overview');
    window.clearTimeout(storyTimer.current);
    storyTimer.current = window.setTimeout(() => setStory(null), 2600);
  }, []);

  // Highlight the region(s) belonging to the active story step.
  useEffect(() => {
    document.querySelectorAll('.is-story').forEach((el) => el.classList.remove('is-story'));
    if (!story) return;
    const els = document.querySelectorAll(`[data-region~="${story}"]`);
    els.forEach((el) => el.classList.add('is-story'));
    els[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [story, tab]);

  useEffect(() => () => window.clearTimeout(storyTimer.current), []);

  const dayDate = new Date(new Date(data.missionStart).getTime() + (view.day - 1) * 86400000);
  const zoneName = ZONES.find((z) => z.indicators.includes(selected))?.name;

  return (
    <main className="twin">
      <StoryBar active={story} onStep={onStep} />
      <div className="twin-grid">
        <LeftColumn selected={selected} onSelect={open} />
        <section className="center" aria-label="Health twin">
          <div className="center-head">
            <h1 className="center-title">
              Day <span className="num">{fmtNumber(view.day)}</span>
              <span className="muted center-date num"> · {fmtDate(dayDate)}</span>
            </h1>
            <span className="hint">Selected: {zoneName}</span>
          </div>
          <PatternBanner patterns={view.patterns} active={shownPattern} onToggle={togglePattern} />
          <BodyStage selected={selected} highlight={highlight} hoverZone={hoverZone} onHover={setHoverZone} onOpen={open} />
        </section>
        <SidePanel selected={selected} tab={tab} onTab={setTab} />
      </div>
      <Timeline dayStatus={dayStatus} />
    </main>
  );
}
