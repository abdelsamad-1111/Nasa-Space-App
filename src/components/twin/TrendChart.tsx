import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STATUS_COLOR, STATUS_WORD, THRESHOLDS, metricDef, type MetricId, type Status } from '../../brain/indicators';
import { dailySeries, evaluateMetricOnDay, isBp, num, radiationContext } from '../../brain/evaluate';
import { useApp } from '../../state/AppState';
import { fmtNumber, fmtTime } from '../../lib/format';

type Range = '24h' | '7d' | 'mission';
const RANGES: { id: Range; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: 'mission', label: 'Mission' },
];

interface Point {
  x: number;
  label: string;
  v: number;
  v2?: number;
  status?: Status;
}

const INK = '#111111';
const GRAY = '#5A5A5A';

export function TrendChart({ id }: { id: MetricId }) {
  const { data, view } = useApp();
  const [range, setRange] = useState<Range>('7d');
  const ind = metricDef(id);
  const day = view.day;
  const bp = id === 'bp';

  const points = useMemo<Point[]>(() => {
    const ms = data.measurements;
    if (range === '24h') {
      const end = ms
        .filter((m) => m.missionDay === day)
        .reduce((t, m) => Math.max(t, new Date(m.timestamp).getTime()), 0);
      if (!end) return [];
      return ms
        .filter((m) => m.indicatorId === id)
        .filter((m) => {
          const t = new Date(m.timestamp).getTime();
          return t <= end && t >= end - 24 * 3600 * 1000 && m.missionDay <= day;
        })
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map((m) => ({
          x: new Date(m.timestamp).getTime(),
          label: `Day ${fmtNumber(m.missionDay)} ${fmtTime(m.timestamp)}`,
          v: num(m.value),
          v2: isBp(m.value) ? m.value.dia : undefined,
        }));
    }
    const from = range === '7d' ? day - 6 : 1;
    return dailySeries(ms, id, day)
      .filter((m) => m.missionDay >= from)
      .map((m) => ({
        x: m.missionDay,
        label: `Day ${fmtNumber(m.missionDay)}`,
        v: num(m.value),
        v2: isBp(m.value) ? m.value.dia : undefined,
        status: evaluateMetricOnDay(ms, id, m.missionDay, data.settings)?.status,
      }));
  }, [data.measurements, data.settings, id, day, range]);

  const baseline = id === 'exercise' ? undefined : data.settings.baselines[id];
  const baseLine =
    id === 'radiation'
      ? radiationContext(data.measurements, day, data.settings.careerRadiationLimit).avg7
      : id === 'exercise'
        ? THRESHOLDS.exercise.targetMin
        : baseline !== undefined
          ? num(baseline)
          : null;
  const baseName = id === 'radiation' ? '7-day avg' : id === 'exercise' ? 'Target' : 'Baseline';
  const baseLine2 = bp && isBp(baseline) ? baseline.dia : null;

  const domain = useMemo<[number, number]>(() => {
    const vals = points.flatMap((p) => (p.v2 !== undefined ? [p.v, p.v2] : [p.v]));
    if (baseLine !== null) vals.push(baseLine);
    let [lo, hi] = ind.chartDomain;
    if (vals.length) {
      lo = Math.min(lo, Math.floor(Math.min(...vals)));
      hi = Math.max(hi, Math.ceil(Math.max(...vals)));
    }
    return [lo, hi];
  }, [points, baseLine, ind.chartDomain]);

  const xDomain: [number | string, number | string] = range === '24h' ? ['dataMin', 'dataMax'] : [range === '7d' ? Math.max(1, day - 6) : 1, day];

  return (
    <div className="trend">
      <div className="segmented trend-range" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      {points.length === 0 ? (
        <p className="muted panel-empty">No readings in this range.</p>
      ) : (
        <div className="trend-chart" role="img" aria-label={`${ind.name} trend, ${points.length} readings`}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              {ind.chartBands.map((b) => (
                <ReferenceArea
                  key={`${b.from}-${b.to}`}
                  y1={Math.max(b.from, domain[0])}
                  y2={Math.min(b.to, domain[1])}
                  fill={STATUS_COLOR[b.status]}
                  fillOpacity={b.status === 'OK' ? 0.07 : 0.1}
                  stroke="none"
                  ifOverflow="hidden"
                />
              ))}
              <CartesianGrid stroke="#D6D6D2" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                domain={xDomain}
                allowDecimals={false}
                tickFormatter={(x: number) => (range === '24h' ? fmtTime(x) : fmtNumber(x))}
                tick={{ fontSize: 11, fill: GRAY }}
                stroke={INK}
                tickLine={false}
                label={range === '24h' ? undefined : { value: 'Mission day', position: 'insideBottomRight', offset: -2, fontSize: 10, fill: GRAY }}
                height={32}
              />
              <YAxis
                domain={domain}
                tickFormatter={(v: number) => fmtNumber(v, ind.decimals === 1 && domain[1] - domain[0] < 5 ? 1 : 0)}
                tick={{ fontSize: 11, fill: GRAY }}
                stroke={INK}
                tickLine={false}
                width={44}
              />
              {baseLine !== null && (
                <ReferenceLine
                  y={baseLine}
                  stroke={GRAY}
                  strokeDasharray="5 4"
                  label={{ value: baseName, position: 'insideTopLeft', fontSize: 10, fill: GRAY }}
                />
              )}
              {baseLine2 !== null && <ReferenceLine y={baseLine2} stroke={GRAY} strokeDasharray="5 4" />}
              <Tooltip
                isAnimationActive={false}
                contentStyle={{ border: `1px solid ${INK}`, borderRadius: 2, fontSize: 12, fontFamily: 'Inter, sans-serif' }}
                labelFormatter={(_: unknown, p: readonly { payload?: Point }[]) => p?.[0]?.payload?.label ?? ''}
                formatter={(value: number, name: string, item: { payload?: Point }) => {
                  const st = item.payload?.status;
                  const txt = `${fmtNumber(value, ind.decimals)} ${ind.unit}${st && name !== 'Diastolic' ? ` — ${STATUS_WORD[st]}` : ''}`;
                  return [txt, name];
                }}
              />
              <Line
                type="linear"
                dataKey="v"
                name={bp ? 'Systolic' : ind.name}
                stroke={INK}
                strokeWidth={1.5}
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; payload?: Point; index?: number }) => (
                  <circle
                    key={`d-${p.index}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={3.5}
                    fill={p.payload?.status ? STATUS_COLOR[p.payload.status] : INK}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                )}
              />
              {bp && (
                <Line
                  type="linear"
                  dataKey="v2"
                  name="Diastolic"
                  stroke={INK}
                  strokeWidth={1.25}
                  strokeDasharray="2 3"
                  dot={{ r: 2.5, fill: INK, stroke: 'none' }}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <ul className="trend-legend hint">
        <li><span className="lg-line" /> {bp ? 'Systolic' : 'Reading'}</li>
        {bp && <li><span className="lg-line lg-dotted" /> Diastolic</li>}
        <li><span className="lg-line lg-dashed" /> {id === 'radiation' ? '7-day average' : id === 'exercise' ? 'Daily target' : 'Your baseline'}</li>
        {ind.chartBands.length > 0 && <li><span className="lg-band" /> Shaded bands = status ranges</li>}
      </ul>
      <p className="hint">Ranges: OK {ind.thresholds.OK}. Watch {ind.thresholds.WATCH}. Act {ind.thresholds.ACT}.{ind.thresholds.CRITICAL !== '—' ? ` Critical ${ind.thresholds.CRITICAL}.` : ''}</p>
    </div>
  );
}
