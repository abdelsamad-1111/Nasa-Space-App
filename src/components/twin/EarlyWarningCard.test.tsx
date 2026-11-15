import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EarlyWarningCard } from './EarlyWarningCard';
import { forecastPresentation } from '../../lib/forecastPresentation';
import { demoState } from '../../data/storage';

const measurements = demoState().measurements;

describe('Next 48 h early-warning card', () => {
  it('shows a missing morning check-in instead of a Low score', () => {
    const html = renderToStaticMarkup(<EarlyWarningCard forecast={null} />);
    expect(html).toContain('No forecast — morning check-in missing');
    expect(html).not.toContain('>Low<');
    expect(html).toContain('Early warning trained on synthetic data — not a diagnosis.');
  });

  it('Day 16: Low, gray bar, no problem, no actions', () => {
    const html = renderToStaticMarkup(<EarlyWarningCard forecast={forecastPresentation(measurements, 16)} />);
    expect(html).toContain('>Low<');
    expect(html).toContain('early-warning-bar');
    expect(html).not.toContain('has-warning');
    expect(html).not.toContain('possible infection');
    expect(html).not.toContain('Do today');
  });

  it('Day 17: Elevated · possible infection starting, plain-word drivers, 3 actions, caption', () => {
    const html = renderToStaticMarkup(<EarlyWarningCard forecast={forecastPresentation(measurements, 17)} />);
    expect(html).toContain('Elevated · possible infection starting');
    expect(html).toContain('heart rate rising · heart rate above your usual');
    expect(html).not.toMatch(/hr_slope|hr_dev/);
    expect((html.match(/<li>/g) ?? []).length).toBe(3);
    expect(html).toContain('Re-measure temperature tonight');
    expect(html).not.toContain('Earth reply');
    expect(html).toContain('Early warning trained on synthetic data — not a diagnosis.');
  });

  it('Day 17 on Mars adds the Earth-delay line', () => {
    const html = renderToStaticMarkup(<EarlyWarningCard forecast={forecastPresentation(measurements, 17)} location="MARS" />);
    expect(html).toContain('Start these steps now — Earth reply can take ~20 min.');
  });
});
