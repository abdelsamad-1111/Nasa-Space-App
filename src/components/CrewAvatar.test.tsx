import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrewAvatar, crewInitials } from './CrewAvatar';

describe('Crew avatar', () => {
  it('uses initials when there is no photo', () => {
    expect(crewInitials('Karam Khasawneh')).toBe('KK');
    const html = renderToStaticMarkup(<CrewAvatar name="Karam Khasawneh" />);
    expect(html).toContain('>KK<');
    expect(html).not.toContain('<img');
  });
  it('shows a round photo when one is set', () => {
    expect(renderToStaticMarkup(<CrewAvatar name="Karam Khasawneh" photo="/assets/crew-photo.png" />)).toContain('src="/assets/crew-photo.png"');
  });
});
