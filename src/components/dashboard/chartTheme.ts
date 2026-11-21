import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

/** Chart.js styling matched to the design tokens (Chart.js can't read CSS variables). */
export const chartTheme = (isDark: boolean) => {
  const text = isDark ? '#c6c1b7' : '#47443d';
  const muted = isDark ? '#918b80' : '#6e6a60';
  const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,27,24,0.07)';
  const surface = isDark ? '#1a1917' : '#ffffff';
  const font = { family: "'IBM Plex Sans', system-ui, sans-serif", size: 12 };

  ChartJS.defaults.font = { ...ChartJS.defaults.font, ...font };
  ChartJS.defaults.color = muted;
  ChartJS.defaults.animation = { duration: 700, easing: 'easeOutQuart' } as any;

  return {
    text,
    muted,
    grid,
    surface,
    accent: isDark ? '#7097f5' : '#2a52cc',
    ink: isDark ? '#c6c1b7' : '#47443d',
    track: isDark ? 'rgba(255,255,255,0.08)' : '#ebe8e1',
    tooltip: {
      backgroundColor: '#1f1e1b',
      titleColor: '#f2efe8',
      bodyColor: '#cfcabf',
      borderWidth: 0,
      padding: 10,
      cornerRadius: 6,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
      boxPadding: 4,
      usePointStyle: true,
      titleFont: { ...font, weight: 600 as const },
      bodyFont: font,
    },
    legend: {
      labels: { color: text, usePointStyle: true, pointStyle: 'circle' as const, boxWidth: 7, boxHeight: 7, padding: 14, font },
    },
    axis: {
      grid: { color: grid, drawTicks: false },
      border: { display: false },
      ticks: { color: muted, padding: 8, font: { ...font, size: 11.5 } },
    },
  };
};
