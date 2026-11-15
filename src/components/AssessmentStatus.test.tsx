import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AssessmentStatus } from './AssessmentStatus';
import { evaluateReading, summarizeAssessment } from '../brain/evaluate';

describe('Assessment completeness display', () => {
  it('never shows a green all-clear when readings are absent or incomplete', () => {
    const empty = renderToStaticMarkup(<AssessmentStatus summary={summarizeAssessment({}, [])} />);
    expect(empty).toContain('No readings');
    expect(empty).not.toContain('status-OK');
    const partial = renderToStaticMarkup(<AssessmentStatus summary={summarizeAssessment({ hr: evaluateReading({ indicatorId: 'hr', value: 70 }) }, [])} />);
    expect(partial).toContain('Incomplete assessment');
    expect(partial).toContain('1 of 8 measured');
    expect(partial).not.toContain('status-OK');
  });

  it('keeps an urgent measured result visible alongside the missing-data warning', () => {
    const summary = summarizeAssessment({ hr: evaluateReading({ indicatorId: 'hr', value: 35 }) }, []);
    const html = renderToStaticMarkup(<AssessmentStatus summary={summary} />);
    expect(html).toContain('status-ACT');
    expect(html).toContain('Incomplete assessment');
    expect(html).toContain('7 not measured');
  });
});
