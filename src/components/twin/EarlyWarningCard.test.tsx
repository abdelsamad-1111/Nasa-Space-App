import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EarlyWarningCard } from './EarlyWarningCard';
import { forecastPresentation } from '../../lib/forecastPresentation';
import { demoState } from '../../data/storage';

const measurements = demoState().measurements;

describe('Selected-day early warning card', () => {
  it('shows a missing check-in instead of a Low score', () => {
    const html = renderToStaticMarkup(<EarlyWarningCard forecast={null} />);
    expect(html).toContain('No forecast — check-in missing');
    expect(html).not.toContain('Low');
    expect(html).toContain('Early warning trained on synthetic data — not a diagnosis.');
  });

  it('shows a Low bar without displaying a possible disease', () => {
    const html = renderToStaticMarkup(<EarlyWarningCard forecast={forecastPresentation(measurements, 5)} />);
    expect(html).toContain('Low');
    expect(html).toContain('early-warning-bar');
    expect(html).not.toContain('Possible infection');
    expect(html).not.toContain('Possible fluid loss');
  });

  it.each([17, 18])('shows the warning, two drivers and mandatory caption on Day %s', (day) => {
    const html = renderToStaticMarkup(<EarlyWarningCard forecast={forecastPresentation(measurements, day)} />);
    expect(html).toContain('Elevated');
    expect(html).toContain('Possible infection starting');
    expect(html).toContain('heart rate rising');
    expect(html).toContain('heart rate above your usual');
    expect((html.match(/<li>/g) ?? []).length).toBe(2);
    expect(html).toContain('Early warning trained on synthetic data — not a diagnosis.');
  });
});
