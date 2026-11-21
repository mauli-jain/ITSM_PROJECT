import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Mail, Menu, MessageSquare, Moon, Plus, Search, Smartphone, Sun } from 'lucide-react';
import { User, PriorityStrategyType, AssignmentStrategyType, Notification } from '../types/itsm';
import { BrandMark } from './Sidebar';
import { EASE } from './ui';

interface NavbarProps {
  currentUser: User;
  onSelectUser: (userId: string) => void;
  allUsers: User[];
  priorityStrategy: PriorityStrategyType;
  assignmentStrategy: AssignmentStrategyType;
  onOpenStrategyModal: () => void;
  onOpenReportModal: () => void;
  onOpenLoginModal?: () => void;
  notifications: Notification[];
  onMarkNotificationsRead: () => void;
  onQuickSearchClick?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenMobileNav?: () => void;
}

const CHANNEL = {
  IN_APP: { label: 'In-app', icon: Smartphone },
  EMAIL: { label: 'Email', icon: Mail },
  SMS: { label: 'SMS', icon: MessageSquare },
} as const;

export const Navbar: React.FC<NavbarProps> = ({
  onOpenReportModal,
  notifications,
  onMarkNotificationsRead,
  onQuickSearchClick,
  isDark,
  onToggleTheme,
  onOpenMobileNav,
}) => {
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;
  const prevUnread = useRef(unread);

  // Ring the bell when a new unread alert arrives.
  useEffect(() => {
    if (unread > prevUnread.current) {
      setRing(true);
      const t = window.setTimeout(() => setRing(false), 950);
      prevUnread.current = unread;
      return () => window.clearTimeout(t);
    }
    prevUnread.current = unread;
  }, [unread]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onQuickSearchClick?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onQuickSearchClick]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" onClick={onOpenMobileNav} className="ui-icon-btn -ml-1.5 lg:hidden" aria-label="Open navigation">
          <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <span className="lg:hidden">
          <BrandMark className="h-6 w-6" />
        </span>

        <button
          type="button"
          onClick={onQuickSearchClick}
          className="group hidden h-8 w-full max-w-[340px] items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-[13px] text-muted transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_1px_2px_rgb(var(--shadow-rgb)/.05)] md:flex"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          <span className="truncate">Search incidents</span>
          <span className="ml-auto flex gap-0.5">
            <kbd className="ui-kbd">{isMac ? '⌘' : 'Ctrl'}</kbd>
            <kbd className="ui-kbd">K</kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="ui-icon-btn overflow-hidden"
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={isDark ? 'Light theme' : 'Dark theme'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? 'sun' : 'moon'}
                initial={{ y: 12, opacity: 0, rotate: -40 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: -12, opacity: 0, rotate: 40 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="grid place-items-center"
              >
                {isDark ? <Sun className="h-[17px] w-[17px]" strokeWidth={1.75} /> : <Moon className="h-[17px] w-[17px]" strokeWidth={1.75} />}
              </motion.span>
            </AnimatePresence>
          </button>

          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`ui-icon-btn relative ${open ? 'bg-surface-3 text-ink' : ''}`}
              aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
              aria-expanded={open}
            >
              <Bell className={`h-[17px] w-[17px] ${ring ? 'animate-ring' : ''}`} strokeWidth={1.75} />
              <AnimatePresence>
                {unread > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                    className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full bg-[#d4442a] ring-2 ring-canvas"
                  />
                )}
              </AnimatePresence>
            </button>

            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: EASE }}
                  style={{ transformOrigin: 'top right' }}
                  className="absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--shadow-pop)]"
                >
                  <div className="flex items-center justify-between px-4 pb-2 pt-3">
                    <span className="text-[13.5px] font-semibold text-ink">
                      Notifications {unread > 0 && <span className="ml-1 font-normal text-muted">· {unread} new</span>}
                    </span>
                    {unread > 0 && (
                      <button type="button" onClick={onMarkNotificationsRead} className="ui-link text-[12.5px]">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[22rem] overflow-y-auto pb-1">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <p className="text-[13.5px] font-medium text-ink">All caught up</p>
                        <p className="mt-0.5 text-[13px] text-muted">New alerts will show up here.</p>
                      </div>
                    ) : (
                      <ul>
                        {notifications.map((n, i) => {
                          const ch = CHANNEL[n.channel as keyof typeof CHANNEL] ?? CHANNEL.IN_APP;
                          return (
                            <motion.li
                              key={n.id}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: Math.min(i, 6) * 0.03, duration: 0.25, ease: EASE }}
                              className="relative mx-1 flex gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2"
                            >
                              <ch.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} aria-label={ch.label} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-3">
                                  <p className={`truncate text-[13px] ${n.read ? 'text-ink-2' : 'font-medium text-ink'}`}>{n.title}</p>
                                  <span className="shrink-0 text-[11.5px] text-muted">{n.timestamp}</span>
                                </div>
                                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{n.message}</p>
                              </div>
                              {!n.read && <span className="absolute left-0 top-3.5 h-1.5 w-1.5 rounded-full bg-accent" aria-label="Unread" />}
                            </motion.li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <span className="mx-1.5 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />

          <button type="button" onClick={onOpenReportModal} className="ui-btn ui-btn-primary h-8 px-3">
            <Plus className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">New incident</span>
          </button>
        </div>
      </div>
    </header>
  );
};
