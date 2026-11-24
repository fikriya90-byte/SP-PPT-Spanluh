import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemeMode, useTheme } from '../../core/themeContext';

interface ThemeSwitcherProps {
  compact?: boolean;
  className?: string;
}

const OPTIONS: { value: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'auto', label: 'Auto', icon: Monitor },
];

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ compact = false, className = '' }) => {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Mode Tampilan (Terang, Gelap, Auto)"
      className={`inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-950/90 p-0.5 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            title={
              opt.value === 'auto'
                ? `Auto (mengikuti perangkat: ${resolvedTheme === 'dark' ? 'Gelap' : 'Terang'})`
                : `Mode ${opt.label}`
            }
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              compact ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-1.5 text-xs'
            } ${
              active
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className={compact ? 'hidden sm:inline' : ''}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
