import { useEffect, useState } from 'react';

/** "KK" from "Karam Khasawneh" (a leading "Astronaut" title is ignored). */
export function crewInitials(name: string): string {
  const words = name.replace(/^Astronaut\s+/i, '').split(/[\s.]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '?';
}

/** Round crew photo; shows the initials circle when there is no photo or it fails to load (never a broken image). */
export function CrewAvatar({ name, photo, size = 52 }: { name: string; photo?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);
  const style = { width: size, height: size };
  if (!photo || failed) {
    return <div className="astro-initials" style={style} aria-hidden="true">{crewInitials(name)}</div>;
  }
  return <img className="astro-photo" src={photo} alt="" style={style} onError={() => setFailed(true)} />;
}
