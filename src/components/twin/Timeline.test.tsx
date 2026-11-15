import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

describe('Timeline model warning markers', () => {
  it('shows only supplied warning days with an explicit synthetic-training label', () => {
    state.data.mode = 'personal';
    const html = renderToStaticMarkup(<Timeline dayStatus={[]} warningDays={[12, 18]} />);
    expect(html).toContain('Early warning on Day 12 — trained on synthetic data, not a diagnosis');
    expect(html).toContain('Early warning on Day 18 — trained on synthetic data, not a diagnosis');
    expect(html).not.toContain('Early warning on Day 5');
    expect(html).toContain('Early warning · synthetic model · not a diagnosis');
    expect(html).not.toContain('Simulated demo scenario events');
    expect(html).not.toContain('Solar event');
  });

  it('keeps warning buttons outside the clinical-status slider and preserves severity ticks', () => {
    state.data.mode = 'personal';
    const html = renderToStaticMarkup(<Timeline dayStatus={['ACT', null, 'WATCH']} warningDays={[18]} />);
    const [beforeSlider, afterSlider] = html.split('role="slider"');
    expect(beforeSlider).toContain('aria-label="Early warning on Day 18');
    expect(afterSlider).not.toContain('aria-label="Early warning on Day');
    expect(afterSlider).toContain('data-status="ACT"');
    expect(afterSlider).toContain('data-status="WATCH"');
  });

  it('does not invent markers for omitted, invalid or out-of-mission days', () => {
    state.data.mode = 'personal';
    expect(renderToStaticMarkup(<Timeline dayStatus={[]} />)).not.toContain('class="tl-warnings"');
    const html = renderToStaticMarkup(<Timeline dayStatus={[]} warningDays={[0, -1, 1.5, NaN, 31, 12, 12]} />);
    expect(html.match(/class="tl-warning(?: is-current)?"/g)).toHaveLength(1);
    expect(html).toContain('Early warning on Day 12');
  });
});
