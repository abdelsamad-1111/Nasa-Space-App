interface Props {
  size?: number;
  onDark?: boolean;
  className?: string;
}

/** An original astronaut insignia shared by the app, assistant and printed reports. */
export function AstronautMark({ size = 36, onDark = false, className = '' }: Props) {
  const outline = onDark ? '#EAF1F8' : '#17283C';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className={`astronaut-mark ${className}`}>
      <path d="M15 46C16.5 39.5 22.4 36 32 36s15.5 3.5 17 10l3 10H12l3-10Z" fill="#E4EDF5" stroke={outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 41v15M43 41v15" stroke="#9AAFC3" strokeWidth="2" />
      <path d="M12 49h7M45 49h7" stroke="#FF6A32" strokeWidth="3" strokeLinecap="round" />
      <path d="M13 25C13 12.8 20.4 5 32 5s19 7.8 19 20v5c0 9-8.3 14-19 14s-19-5-19-14v-5Z" fill="#F4F8FC" stroke={outline} strokeWidth="2" />
      <path d="M19 23c0-7.6 5.1-12 13-12s13 4.4 13 12v6c0 5.6-5.1 8-13 8s-13-2.4-13-8v-6Z" fill="#14283E" stroke="#96AABD" strokeWidth="1.5" />
      <path d="M22 24c.5-5.6 4.2-8.6 10-8.6 5.2 0 8.4 2.1 10 6.1v6.7c-3.7 3.2-8 4.5-13.6 3.2L22 29v-5Z" fill="#D89035" />
      <path d="M22 24c6.7 2.6 12.5 1.2 20-2.5v4.4c-6.3 5.3-12.7 6.1-20 3.1v-5Z" fill="#F4BC62" />
      <path d="M25 20c1.5-2 3.5-2.9 6.5-3.1" stroke="#FFF4D8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M36 31.8l4-2" stroke="#FFF4D8" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="9" y="22" width="5" height="12" rx="2.2" fill="#A6BACD" stroke={outline} strokeWidth="1.5" />
      <rect x="50" y="22" width="5" height="12" rx="2.2" fill="#A6BACD" stroke={outline} strokeWidth="1.5" />
      <path d="M19 36c3.8 3 8.1 4.5 13 4.5S41.2 39 45 36" stroke="#9AAFC3" strokeWidth="2" strokeLinecap="round" />
      <rect x="25" y="44" width="14" height="13" rx="2" fill="#173047" stroke={outline} strokeWidth="1.5" />
      <path d="M28 50.5h2l1.2-2.4 1.8 5 1.3-2.6H36" stroke="#FF824A" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="43" cy="47" r="1.5" fill="#FF6A32" />
    </svg>
  );
}
