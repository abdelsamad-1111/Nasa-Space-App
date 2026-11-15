import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrewAvatar, crewInitials } from './CrewAvatar';

describe('Crew avatar', () => {
  it('uses initials when there is no photo', () => {
    expect(crewInitials('Lina Khalil')).toBe('LK');
    const html = renderToStaticMarkup(<CrewAvatar name="Lina Khalil" />);
    expect(html).toContain('>LK<');
    expect(html).not.toContain('<img');
  });
  it('shows a round photo when one is set', () => {
    expect(renderToStaticMarkup(<CrewAvatar name="Lina Khalil" photo="/assets/crew-photo.png" />)).toContain('src="/assets/crew-photo.png"');
  });
});
