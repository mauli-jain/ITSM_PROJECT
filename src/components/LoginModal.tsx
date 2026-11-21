import React, { useState } from 'react';
import { User } from '../types/itsm';
import { apiClient } from '../api/client';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';
import { BrandMark } from './Sidebar';
import { Modal, Spinner } from './ui';

interface LoginModalProps {
  onLoginSuccess: (user: User) => void;
  onClose: () => void;
  isDark: boolean;
}

const DEMO_ACCOUNTS = [
  { name: 'Mauli Jain', role: 'Administrator', username: 'mauli', password: 'admin123' },
  { name: 'Shambhavi Chaturvedi', role: 'Technician', username: 'shambhavi', password: 'password' },
  { name: 'Tulika Devale', role: 'Technician', username: 'tulika', password: 'password' },
  { name: 'Simran Misra', role: 'Technician', username: 'simran', password: 'password' },
];

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onClose }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameError = touched.username && !username.trim() ? 'Enter your username.' : null;
  const passwordError = touched.password && !password ? 'Enter your password.' : null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ username: true, password: true });
    if (!username.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.auth.login(username.trim(), password);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err?.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="login-title" size="sm">
      <div className="overflow-y-auto px-6 pb-6 pt-8 sm:px-8">
        <div className="mb-6 text-center">
          <motion.span
            className="mx-auto mb-4 block w-fit"
            initial={{ rotate: -8, scale: 0.9, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.05 }}
          >
            <BrandMark className="h-10 w-10" />
          </motion.span>
          <h2 id="login-title" className="text-xl font-bold tracking-tight text-ink">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-muted">Sign in to the I-ITSM service desk.</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          <div>
            <label htmlFor="login-username" className="ui-label">
              Username
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, username: true }))}
              placeholder="e.g. mauli"
              className="ui-input"
              aria-invalid={!!usernameError}
              aria-describedby={usernameError ? 'login-username-err' : undefined}
            />
            {usernameError && <p id="login-username-err" className="ui-field-error">{usernameError}</p>}
          </div>

          <div>
            <label htmlFor="login-password" className="ui-label">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder="••••••••"
                className="ui-input pr-10"
                aria-invalid={!!passwordError}
                aria-describedby={passwordError ? 'login-password-err' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordError && <p id="login-password-err" className="ui-field-error">{passwordError}</p>}
          </div>

          <button type="submit" disabled={loading} className="ui-btn ui-btn-primary h-9 w-full">
            {loading ? (
              <>
                <Spinner /> Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="mt-7">
          <div className="mb-3 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            Demo accounts
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((preset) => {
              const selected = username === preset.username;
              return (
                <button
                  key={preset.username}
                  type="button"
                  onClick={() => {
                    setUsername(preset.username);
                    setPassword(preset.password);
                    setError(null);
                  }}
                  className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                    selected ? 'border-ink/60 bg-surface-2' : 'border-line hover:border-line-strong hover:bg-surface-2'
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-ink-2">
                    {initials(preset.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">{preset.name.split(' ')[0]}</span>
                    <span className="block truncate text-xs text-muted">{preset.role}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-muted">Selecting an account fills in its local demo credentials.</p>
        </div>

        <div className="mt-5 text-center">
          <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-sm">
            Not now
          </button>
        </div>
      </div>
    </Modal>
  );
};
