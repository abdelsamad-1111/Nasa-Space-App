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
