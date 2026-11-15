import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WarningDay } from '../../lib/forecastPresentation';
import { Timeline } from './Timeline';

const state = vi.hoisted(() => ({ day: 18, maxDay: 30, setDay: () => {}, data: { mode: 'personal' as 'demo' | 'personal' } }));
vi.mock('../../state/AppState', () => ({ useApp: () => state }));

describe('Timeline scenario provenance', () => {
  it('never labels a personal mission with invented infection or solar events', () => {
    state.data.mode = 'personal';
    const html = renderToStaticMarkup(<Timeline dayStatus={[]} />);
    expect(html).not.toContain('Possible infection');
    expect(html).not.toContain('possible infection');
    expect(html).not.toContain('Solar event');
    expect(html).not.toContain('tl-event-pin');
    expect(html).toContain('Mission day');
  });

  it('retains clearly labeled scenario events in the demo mission', () => {
    state.data.mode = 'demo';
    const html = renderToStaticMarkup(<Timeline dayStatus={[]} />);
    expect(html).toContain('Simulated demo scenario events');
    expect(html).toContain('Solar event');
    expect(html).toContain('possible infection');
  });
});

const w = (day: number, problem: 'infection' | 'fluid_loss' = 'infection', riskPercent = 99): WarningDay => ({ day, problem, riskPercent });

describe('Timeline model warning markers', () => {
  it('shows only supplied warning days with problem, risk and the synthetic-training label', () => {
    state.data.mode = 'personal';
    const html = renderToStaticMarkup(<Timeline dayStatus={[]} warnings={[w(12, 'fluid_loss', 91), w(18)]} />);
    expect(html).toContain('Early warning: possible fluid loss · 91% (Day 12) — trained on synthetic data, not a diagnosis');
    expect(html).toContain('Early warning: possible infection · 99% (Day 18) — trained on synthetic data, not a diagnosis');
    expect(html).not.toContain('(Day 5)');
    expect(html).toContain('Early warning (next 48 h) · synthetic model · not a diagnosis');
    expect(html).not.toContain('Simulated demo scenario events');
    expect(html).not.toContain('Solar event');
  });

  it('keeps warning buttons outside the clinical-status slider and preserves severity ticks', () => {
    state.data.mode = 'personal';
    const html = renderToStaticMarkup(<Timeline dayStatus={['ACT', null, 'WATCH']} warnings={[w(18)]} />);
    const [beforeSlider, afterSlider] = html.split('role="slider"');
    expect(beforeSlider).toContain('aria-label="Early warning: possible infection');
    expect(afterSlider).not.toContain('aria-label="Early warning');
    expect(afterSlider).toContain('data-status="ACT"');
    expect(afterSlider).toContain('data-status="WATCH"');
  });

  it('does not invent markers for omitted, invalid or out-of-mission days', () => {
    state.data.mode = 'personal';
    expect(renderToStaticMarkup(<Timeline dayStatus={[]} />)).not.toContain('class="tl-warnings"');
    const html = renderToStaticMarkup(<Timeline dayStatus={[]} warnings={[0, -1, 1.5, NaN, 31, 12, 12].map((d) => w(d))} />);
    expect(html.match(/class="tl-warning(?: is-current)?"/g)).toHaveLength(1);
    expect(html).toContain('(Day 12)');
  });
});
