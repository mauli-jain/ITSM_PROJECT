import React from 'react';
import { CountUp } from '../ui';

export const Sparkline: React.FC<{ data: number[]; stroke: string; id: string }> = ({ data, stroke, id }) => {
  if (data.length < 2) return null;
  const w = 72;
  const h = 24;
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 2 - (v / max) * (h - 5)] as const);
  // Smooth Catmull-Rom → Bézier so the line reads as a trend, not a zig-zag.
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#spark-${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" pathLength={1} className="spark-line" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={stroke} />
    </svg>
  );
};

export interface Stat {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  /** Change vs previous period; `goodWhenUp` decides the colour. */
  delta?: number;
  goodWhenUp?: boolean;
  note?: string;
  spark?: number[];
  sparkColor?: string;
  onClick?: () => void;
}

/** One quiet strip of numbers, separated by hairlines — easier to scan than four cards. */
export const StatStrip: React.FC<{ stats: Stat[] }> = ({ stats }) => (
  <div className="ui-card grid grid-cols-2 overflow-hidden lg:grid-cols-4">
    {stats.map((s, i) => {
      const good = s.delta === undefined || s.delta === 0 ? null : s.delta > 0 === (s.goodWhenUp ?? true);
      return (
        <button
          key={s.id}
          type="button"
          onClick={s.onClick}
          className={`group relative flex min-w-0 flex-col px-5 py-4 text-left transition-colors hover:bg-surface-2 ${
            i % 2 === 1 ? 'border-l border-line' : ''
          } ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
        >
          <span className="text-[13px] text-muted transition-colors group-hover:text-ink-2">{s.label}</span>
          <span className="mt-1.5 flex items-end justify-between gap-3">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">
              <CountUp value={s.value} suffix={s.suffix} />
            </span>
            {s.spark && <Sparkline data={s.spark} stroke={s.sparkColor ?? 'var(--muted)'} id={s.id} />}
          </span>
          <span className="mt-2.5 text-[12.5px] text-muted">
            {s.delta !== undefined ? (
              <>
                <span
                  className={`font-medium tabular-nums ${
                    good === null ? '' : good ? 'text-[#2d6a39] dark:text-[#9fd2a8]' : 'text-[#a62a14] dark:text-[#f4a08f]'
                  }`}
                >
                  {s.delta > 0 ? '↑' : s.delta < 0 ? '↓' : '–'} {Math.abs(s.delta)}
                </span>{' '}
                {s.note ?? 'vs last week'}
              </>
            ) : (
              s.note
            )}
          </span>
        </button>
      );
    })}
  </div>
);
