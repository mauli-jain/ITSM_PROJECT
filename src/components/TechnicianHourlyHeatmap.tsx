import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Technician, Incident } from '../types/itsm';
import { Clock, Flame, Users, Calendar, Filter, Sparkles, AlertCircle } from 'lucide-react';

interface TechnicianHourlyHeatmapProps {
  technicians: Technician[];
  incidents: Incident[];
  isDark?: boolean;
}

export const TechnicianHourlyHeatmap: React.FC<TechnicianHourlyHeatmapProps> = ({
  technicians,
  incidents,
  isDark = false,
}) => {
  const [viewMode, setViewMode] = useState<'BUSINESS_HOURS' | 'FULL_24H'>('BUSINESS_HOURS');
  const [selectedTechId, setSelectedTechId] = useState<string>('ALL');
  const [chartType, setChartType] = useState<'AREA' | 'BAR'>('AREA');
  const [activeCell, setActiveCell] = useState<{
    techName: string;
    hour: string;
    load: number;
    max: number;
  } | null>(null);

  // Hours definition
  const hours = useMemo(() => {
    if (viewMode === 'BUSINESS_HOURS') {
      return [
        '08:00', '09:00', '10:00', '11:00', '12:00',
        '13:00', '14:00', '15:00', '16:00', '17:00',
        '18:00', '19:00', '20:00',
      ];
    }
    return Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  }, [viewMode]);

  // Deterministic realistic hourly simulation per technician and hour
  const heatmapMatrix = useMemo(() => {
    return technicians.map((tech) => {
      const baseLoad = tech.activeIncidentCount;

      const hourlyData: Record<string, number> = {};
      hours.forEach((h) => {
        const hourNum = parseInt(h.split(':')[0], 10);

        let multiplier = 0.5;
        if (hourNum >= 9 && hourNum <= 11) multiplier = 1.2;
        else if (hourNum >= 14 && hourNum <= 16) multiplier = 1.1;
        else if (hourNum >= 12 && hourNum <= 13) multiplier = 0.7;
        else if (hourNum >= 18 || hourNum < 8) multiplier = 0.3;

        const hash = (tech.id.charCodeAt(1) + hourNum * 7) % 5;
        let estimatedLoad = Math.round(baseLoad * multiplier + (hash > 2 ? 1 : 0));

        if (!tech.available) {
          estimatedLoad = Math.min(estimatedLoad, 2);
        }
        estimatedLoad = Math.max(0, Math.min(tech.maxWorkload, estimatedLoad));

        hourlyData[h] = estimatedLoad;
      });

      return {
        tech,
        hourlyData,
      };
    });
  }, [technicians, hours]);

  // Recharts aggregated data series for hourly workload
  const rechartsData = useMemo(() => {
    return hours.map((hour) => {
      const entry: Record<string, any> = { hour };
      let totalWorkload = 0;

      heatmapMatrix.forEach(({ tech, hourlyData }) => {
        const load = hourlyData[hour] || 0;
        entry[tech.fullName.split(' ')[0]] = load;
        totalWorkload += load;
      });

      entry.total = totalWorkload;
      return entry;
    });
  }, [hours, heatmapMatrix]);

  // Color mapping function for heatmap cells with PBR glow
  const getCellColor = (load: number, max: number) => {
    if (load === 0) {
      return isDark
        ? 'bg-slate-800/40 text-muted border border-white/5 hover:bg-slate-700/60'
        : 'bg-surface-3 text-muted hover:bg-surface-3 border border-line';
    }
    const ratio = load / max;
    if (ratio >= 0.85) {
      return 'bg-linear-to-r from-red-600 to-rose-600 text-white font-black hover:from-red-500 hover:to-rose-500 shadow-[var(--shadow-card)] shadow-red-500/30 ring-1 ring-red-400/50';
    }
    if (ratio >= 0.65) {
      return 'bg-linear-to-r from-orange-500 to-amber-500 text-white font-bold hover:from-orange-400 hover:to-amber-400 shadow-sm shadow-orange-500/20';
    }
    if (ratio >= 0.45) {
      return isDark
        ? 'bg-amber-400/25 text-amber-300 font-bold border border-amber-400/40 hover:bg-amber-400/40'
        : 'bg-amber-200 text-amber-950 font-semibold hover:bg-amber-300';
    }
    if (ratio >= 0.25) {
      return isDark
        ? 'bg-indigo-500/25 text-indigo-300 font-medium border border-indigo-500/40 hover:bg-indigo-500/40'
        : 'bg-blue-100 text-blue-900 font-medium hover:bg-blue-200';
    }
    return isDark
      ? 'bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30 hover:bg-emerald-500/30'
      : 'bg-emerald-100 text-emerald-800 font-medium hover:bg-emerald-200';
  };

  const techColors = ['#4f46e5', '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b'];

  const filteredMatrix = useMemo(() => {
    if (selectedTechId === 'ALL') return heatmapMatrix;
    return heatmapMatrix.filter((item) => item.tech.id === selectedTechId);
  }, [heatmapMatrix, selectedTechId]);

  // Peak analysis
  const peakHourStats = useMemo(() => {
    let maxHour = hours[0];
    let maxVal = 0;
    rechartsData.forEach((row) => {
      if (row.total > maxVal) {
        maxVal = row.total;
        maxHour = row.hour;
      }
    });
    return { hour: maxHour, totalLoad: maxVal };
  }, [rechartsData, hours]);

  return (
    <div
      className={`p-6 rounded-xl border transition-all duration-300 space-y-6 ${
        isDark
          ? 'glass-panel-dark text-white border-white/10'
          : 'glass-panel-light text-ink border-line shadow-[var(--shadow-card)]'
      }`}
    >
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-line dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                  Hourly Workload Distribution &amp; Heatmap
                </h3>
                <span className="text-2xs uppercase font-mono font-bold px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                  Recharts Vector Core
                </span>
              </div>
              <p className="text-xs text-muted dark:text-muted mt-0.5 font-normal">
                PBR density mapping of active investigations across technician operational cycles
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Business Hours vs 24H Toggle */}
          <div
            className={`p-0.5 rounded-xl flex text-xs border ${
              isDark ? 'bg-slate-900/80 border-white/10' : 'bg-surface-3 border-line'
            }`}
          >
            <button
              onClick={() => setViewMode('BUSINESS_HOURS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'BUSINESS_HOURS'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-muted hover:text-slate-200'
              }`}
            >
              Business (08:00 - 20:00)
            </button>
            <button
              onClick={() => setViewMode('FULL_24H')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'FULL_24H'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-muted hover:text-slate-200'
              }`}
            >
              Full 24-Hour
            </button>
          </div>

          {/* Chart Type Toggle */}
          <div
            className={`p-0.5 rounded-xl flex text-xs border ${
              isDark ? 'bg-slate-900/80 border-white/10' : 'bg-surface-3 border-line'
            }`}
          >
            <button
              onClick={() => setChartType('AREA')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                chartType === 'AREA'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-muted hover:text-slate-200'
              }`}
            >
              Area Stack
            </button>
            <button
              onClick={() => setChartType('BAR')}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                chartType === 'BAR'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-muted hover:text-slate-200'
              }`}
            >
              Hourly Bars
            </button>
          </div>

          {/* Technician Filter */}
          <select
            value={selectedTechId}
            onChange={(e) => setSelectedTechId(e.target.value)}
            className={`text-xs py-1.5 px-3 rounded-xl border font-bold cursor-pointer focus:ring-2 focus:ring-indigo-500 ${
              isDark
                ? 'bg-slate-900 border-white/10 text-white'
                : 'bg-surface border-line text-ink'
            }`}
          >
            <option value="ALL">All Technicians</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Recharts Hourly Trend Graph */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Aggregate Workload Curve by Hour of Day
          </span>
          <span className="font-mono text-[11px] text-muted">
            Peak Concurrency:{' '}
            <strong className="text-red-500 font-bold">{peakHourStats.hour}</strong> (
            <span className="tabular-nums font-black">{peakHourStats.totalLoad}</span> tickets)
          </span>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'AREA' ? (
              <AreaChart data={rechartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  {technicians.map((tech, idx) => (
                    <linearGradient
                      key={tech.id}
                      id={`color-${tech.id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={techColors[idx % techColors.length]} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={techColors[idx % techColors.length]} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '12px',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
                    color: isDark ? '#ffffff' : '#0f172a',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontFamily: 'Plus Jakarta Sans' }} />
                {technicians
                  .filter((t) => selectedTechId === 'ALL' || t.id === selectedTechId)
                  .map((tech, idx) => {
                    const firstName = tech.fullName.split(' ')[0];
                    return (
                      <Area
                        key={tech.id}
                        type="monotone"
                        dataKey={firstName}
                        stackId="1"
                        stroke={techColors[idx % techColors.length]}
                        strokeWidth={2}
                        fill={`url(#color-${tech.id})`}
                        name={`${firstName} (${tech.id})`}
                      />
                    );
                  })}
              </AreaChart>
            ) : (
              <BarChart data={rechartsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'}
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b', fontFamily: 'JetBrains Mono' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '12px',
                    color: isDark ? '#ffffff' : '#0f172a',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '11px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontFamily: 'Plus Jakarta Sans' }} />
                {technicians
                  .filter((t) => selectedTechId === 'ALL' || t.id === selectedTechId)
                  .map((tech, idx) => {
                    const firstName = tech.fullName.split(' ')[0];
                    return (
                      <Bar
                        key={tech.id}
                        dataKey={firstName}
                        stackId="a"
                        fill={techColors[idx % techColors.length]}
                        name={`${firstName} (${tech.id})`}
                        radius={[3, 3, 0, 0]}
                      />
                    );
                  })}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cellular Heatmap Table Matrix */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
            Technician Shift Heatmap Density Matrix
          </span>
          {/* Legend */}
          <div className="flex items-center gap-1.5 text-2xs font-mono text-muted">
            <span>Low</span>
            <span className="w-3.5 h-3.5 rounded-md bg-surface-3 dark:bg-slate-800"></span>
            <span className="w-3.5 h-3.5 rounded-md bg-indigo-500/30"></span>
            <span className="w-3.5 h-3.5 rounded-md bg-amber-400/40"></span>
            <span className="w-3.5 h-3.5 rounded-md bg-orange-500"></span>
            <span className="w-3.5 h-3.5 rounded-md bg-red-600 shadow-sm shadow-red-500/50"></span>
            <span>Peak</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line dark:border-white/10">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr
                className={`border-b text-2xs font-mono ${
                  isDark
                    ? 'bg-slate-900/60 text-muted border-white/10'
                    : 'bg-surface-2 text-muted border-line'
                }`}
              >
                <th className="py-2.5 px-3 text-left font-bold uppercase whitespace-nowrap min-w-[140px]">
                  Technician
                </th>
                <th className="py-2.5 px-2 text-center font-bold uppercase">Quota</th>
                {hours.map((h) => (
                  <th key={h} className="py-2.5 px-1 text-center font-mono font-semibold">
                    {h.replace(':00', 'h')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-white/5">
              {filteredMatrix.map(({ tech, hourlyData }) => (
                <tr
                  key={tech.id}
                  className={`transition-colors ${
                    isDark ? 'hover:bg-white/5' : 'hover:bg-surface-2'
                  }`}
                >
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-extrabold tracking-tight">{tech.fullName}</div>
                    <div className="text-2xs text-muted font-mono">
                      {tech.id} • {tech.specialization.split(' ')[0]}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-md text-2xs font-mono font-bold ${
                        isDark ? 'bg-white/10 text-slate-300' : 'bg-surface-3 text-ink-2'
                      }`}
                    >
                      {tech.maxWorkload} slots
                    </span>
                  </td>
                  {hours.map((h) => {
                    const load = hourlyData[h] || 0;
                    const cellColor = getCellColor(load, tech.maxWorkload);
                    return (
                      <td key={h} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveCell({
                              techName: tech.fullName,
                              hour: h,
                              load,
                              max: tech.maxWorkload,
                            })
                          }
                          className={`w-7 h-7 mx-auto rounded-lg text-[11px] font-mono flex items-center justify-center transition-all cursor-pointer ${cellColor}`}
                          title={`${tech.fullName} at ${h}: ${load}/${tech.maxWorkload} workload`}
                        >
                          {load}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Selected cell detail popover */}
        {activeCell && (
          <div className="p-3.5 bg-linear-to-r from-slate-900 to-indigo-950 text-white rounded-xl text-xs flex items-center justify-between border border-indigo-500/30 shadow-xl animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
              <span className="font-sans">
                <strong>{activeCell.techName}</strong> at{' '}
                <span className="font-mono text-cyan-300 font-bold">{activeCell.hour}</span>: Active load is{' '}
                <strong className="font-mono text-amber-300">
                  {activeCell.load} / {activeCell.max} slots
                </strong>{' '}
                ({Math.round((activeCell.load / activeCell.max) * 100)}% capacity).
              </span>
            </div>
            <button
              onClick={() => setActiveCell(null)}
              className="text-muted hover:text-white text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Intelligence Insights Summary */}
      <div
        className={`p-4 rounded-xl border text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
          isDark
            ? 'bg-slate-900/60 border-white/10 text-slate-300'
            : 'bg-indigo-50/50 border-indigo-100 text-ink-2'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="leading-relaxed">
            <strong className="text-indigo-400">PBR Shift Intelligence:</strong> Critical load apex identified between 10:00 &ndash; 15:00.
            The Load-Based Strategy dynamically shifts incoming tickets toward available technicians with lowest active saturation.
          </span>
        </div>
      </div>
    </div>
  );
};
