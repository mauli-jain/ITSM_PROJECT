import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import type { IncidentStatus, Priority } from '../types/itsm';

/** Shared easing: quick start, long gentle settle. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: 'spring', stiffness: 500, damping: 40, mass: 0.8 } as const;

/* -------------------------------------------------------------------------- */
/* Meaningful colour                                                          */
/* -------------------------------------------------------------------------- */

export const PRIORITY_META: Record<Priority, { label: string; tone: string; color: string }> = {
  P1: { label: 'Critical', tone: 'tone-p1', color: '#d4442a' },
  P2: { label: 'High', tone: 'tone-p2', color: '#e08422' },
  P3: { label: 'Medium', tone: 'tone-p3', color: '#d2a716' },
  P4: { label: 'Low', tone: 'tone-p4', color: '#4f9a5c' },
};

export const STATUS_META: Record<IncidentStatus, { label: string; color: string }> = {
  NEW: { label: 'New', color: '#3e66db' },
  CLASSIFIED: { label: 'Classified', color: '#6d80a6' },
  ASSIGNED: { label: 'Assigned', color: '#8b72c0' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: '#2f8f9d' },
  IN_PROGRESS: { label: 'In progress', color: '#d08a16' },
  NEEDS_INFO: { label: 'Needs info', color: '#c2537e' },
  RESOLVED: { label: 'Resolved', color: '#4f9a5c' },
  VERIFIED: { label: 'Verified', color: '#2f7a46' },
  CLOSED: { label: 'Closed', color: '#a29d92' },
};

export const PriorityBadge: React.FC<{ priority: Priority; compact?: boolean }> = ({ priority, compact }) => {
  const meta = PRIORITY_META[priority];
  return (
    <span className={`ui-badge ${meta.tone} font-mono`} title={`${priority} · ${meta.label}`}>
      {priority}
      {!compact && <span className="font-sans font-normal opacity-85">{meta.label}</span>}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: IncidentStatus }> = ({ status }) => {
  const meta = STATUS_META[status] ?? { label: status, color: '#a29d92' };
  return (
    <span className="ui-status">
      <span className="ui-status-dot" style={{ background: meta.color }} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

export type SlaState = 'BREACHED' | 'AT_RISK' | 'ON_TRACK';

/** SLA as a thin progress track; colour carries the state, text confirms it. */
export const SlaBadge: React.FC<{ state: SlaState; percent?: number }> = ({ state, percent = 0 }) => {
  const pct = Math.min(100, Math.max(0, percent));
  const color = state === 'BREACHED' ? '#d4442a' : state === 'AT_RISK' ? '#e08422' : '#4f9a5c';
  const label = state === 'BREACHED' ? 'Breached' : state === 'AT_RISK' ? 'At risk' : `${pct}%`;
  return (
    <span className="inline-flex items-center gap-2 text-[13px]" title={`${pct}% of resolution window used`}>
      <span className="relative h-[5px] w-12 overflow-hidden rounded-full bg-surface-3">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${state === 'BREACHED' ? 100 : pct}%` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </span>
      <span className={`tabular-nums ${state === 'ON_TRACK' ? 'text-muted' : 'font-medium'}`} style={state === 'ON_TRACK' ? undefined : { color }}>
        {label}
      </span>
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export const PageHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="ui-page-title">{title}</h1>
      {description && <p className="ui-page-desc">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, className = '', bodyClassName = 'p-5', children }) => (
  <section className={`ui-card ${className}`}>
    {(title || actions) && (
      <header className="ui-card-header">
        <div className="min-w-0">
          {title && <h2 className="ui-card-title">{title}</h2>}
          {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </header>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);

/** Fade-and-rise on mount; `index` staggers siblings. */
export const Reveal: React.FC<{ index?: number; className?: string; children: React.ReactNode }> = ({
  index = 0,
  className,
  children,
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`min-w-0 ${className ?? ''}`}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(index, 8) * 0.045 }}
    >
      {children}
    </motion.div>
  );
};

export const EmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <motion.div
    className="flex flex-col items-center justify-center px-6 py-14 text-center"
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3, ease: EASE }}
  >
    <Icon className="mb-3 h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden="true" />
    <p className="text-sm font-medium text-ink">{title}</p>
    {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </motion.div>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <span className={`ui-skeleton block ${className}`} aria-hidden="true" />
);

/* -------------------------------------------------------------------------- */
/* Segmented control & tabs with sliding indicators                          */
/* -------------------------------------------------------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: React.ReactNode; icon?: React.ElementType }[];
  label: string;
}) {
  const id = useId();
  return (
    <div className="ui-segmented has-pill" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(o.id)}>
            {active && <motion.span layoutId={`seg-${id}`} className="ui-seg-pill" transition={SPRING} />}
            {o.icon && <o.icon className="h-3.5 w-3.5" />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: React.ReactNode; icon?: React.ElementType; badge?: React.ReactNode }[];
  label: string;
}) {
  const id = useId();
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} type="button" role="tab" aria-selected={active} onClick={() => onChange(o.id)}>
            {o.icon && <o.icon className="h-4 w-4" strokeWidth={1.75} />}
            {o.label}
            {o.badge}
            {active && <motion.span layoutId={`tab-${id}`} className="ui-tab-line" transition={SPRING} />}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Count-up number                                                            */
/* -------------------------------------------------------------------------- */

export const CountUp: React.FC<{ value: number; suffix?: string; duration?: number }> = ({
  value,
  suffix = '',
  duration = 700,
}) => {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const fromRef = useRef(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);

  return (
    <span className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Overlays                                                                   */
/* -------------------------------------------------------------------------- */

function useEscape(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, enabled]);
}

function useBodyScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

const Backdrop: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
  <motion.div
    className="fixed inset-0 bg-[#1c1b18]/30 backdrop-blur-[2px] dark:bg-black/55"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease: EASE }}
    onClick={onClick}
    aria-hidden="true"
  />
);

interface OverlayProps {
  onClose: () => void;
  labelledBy?: string;
  children: React.ReactNode;
  dismissible?: boolean;
}

export const Modal: React.FC<OverlayProps & { size?: 'sm' | 'md' | 'lg' }> = ({
  onClose,
  labelledBy,
  children,
  size = 'md',
  dismissible = true,
}) => {
  useEscape(onClose, dismissible);
  useBodyScrollLock();
  const width = size === 'sm' ? 'max-w-[420px]' : size === 'lg' ? 'max-w-[720px]' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]" role="presentation">
      <Backdrop onClick={dismissible ? onClose : undefined} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative flex max-h-[86vh] w-full ${width} flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-[var(--shadow-pop)]`}
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.985, transition: { duration: 0.15 } }}
        transition={{ duration: 0.32, ease: EASE }}
      >
        {children}
      </motion.div>
    </div>
  );
};

export const Drawer: React.FC<OverlayProps & { width?: string }> = ({
  onClose,
  labelledBy,
  children,
  width = 'max-w-[760px]',
}) => {
  useEscape(onClose);
  useBodyScrollLock();
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <Backdrop onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative m-0 flex h-full w-full ${width} flex-col border-l border-line bg-surface text-ink shadow-[var(--shadow-pop)] sm:m-2 sm:h-[calc(100%-1rem)] sm:rounded-xl sm:border`}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0, transition: { duration: 0.18, ease: EASE } }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {children}
      </motion.aside>
    </div>
  );
};

export const OverlayHeader: React.FC<{
  id?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  onClose: () => void;
  children?: React.ReactNode;
}> = ({ id, title, subtitle, onClose, children }) => (
  <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
    <div className="min-w-0">
      <h2 id={id} className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>}
      {children}
    </div>
    <button type="button" onClick={onClose} className="ui-icon-btn -mr-2 -mt-1 shrink-0" aria-label="Close">
      <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </button>
  </header>
);

export const Spinner: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const ToastContext = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const icon = { success: Check, error: AlertTriangle, info: Info } as const;
  const iconColor = { success: 'text-[#8fd19b]', error: 'text-[#f4a08f]', info: 'text-[#9db7f8]' } as const;

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = icon[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.16 } }}
                transition={{ duration: 0.35, ease: EASE }}
                className="pointer-events-auto flex w-full items-start gap-3 rounded-lg bg-[#1f1e1b] px-3.5 py-3 text-[#f2efe8] shadow-[0_10px_30px_-10px_rgb(0_0_0/.45)] ring-1 ring-white/5 dark:bg-[#2c2a26]"
                role="status"
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor[t.kind]}`} strokeWidth={2.2} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium leading-5">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-[13px] leading-5 text-[#bdb8ad]">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-[#9a958a] transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
