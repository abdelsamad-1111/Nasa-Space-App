// All numbers and dates are formatted with locale 'en-US' (never the browser locale).
import { INDICATORS, type IndicatorId, type ReadingValue } from '../brain/indicators';
import { isBp } from '../brain/evaluate';

export const LOCALE = 'en-US';

export function fmtNumber(n: number, decimals = 0): string {
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    numberingSystem: 'latn',
  } as Intl.NumberFormatOptions);
}

export function fmtValue(id: IndicatorId, v: ReadingValue): string {
  if (isBp(v)) return `${fmtNumber(v.sys)}/${fmtNumber(v.dia)}`;
  return fmtNumber(v, INDICATORS[id].decimals);
}

export function fmtPct(p: number | null): string {
  if (p === null) return '—';
  const sign = p > 0 ? '+' : p < 0 ? '−' : '±';
  return `${sign}${fmtNumber(Math.abs(Math.round(p)))}%`;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  numberingSystem: 'latn',
} as Intl.DateTimeFormatOptions);

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  numberingSystem: 'latn',
} as Intl.DateTimeFormatOptions);

export const fmtDate = (iso: string | number | Date) => dateFmt.format(new Date(iso));
export const fmtTime = (iso: string | number | Date) => timeFmt.format(new Date(iso));

/** Parse user input that may contain Arabic-Indic digits or a comma decimal. */
export function parseNumberInput(raw: string): number | null {
  const western = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(western)) return null;
  return Number(western);
}
