import React from 'react';
import { DashboardPersona } from '../types';
import { Shield, Sliders, Eye, Code } from 'lucide-react';

interface DevRoleSwitcherProps {
  currentPersona: DashboardPersona;
  onSelectPersona: (persona: DashboardPersona) => void;
  theme?: 'light' | 'dark';
}

export const DevRoleSwitcher: React.FC<DevRoleSwitcherProps> = ({
  currentPersona,
  onSelectPersona,
  theme = 'light'
}) => {
  const isDark = theme === 'dark';

  return (
    <div className={`border-b text-xs font-sans transition-colors ${
      isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
    }`}>
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <Code className="w-3 h-3" />
            DEV ROLE SWITCHER
          </span>
          <span className="hidden sm:inline text-slate-400">Select dashboard persona view:</span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => onSelectPersona('operator')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              currentPersona === 'operator'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : isDark
                ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Operator (/ops)</span>
          </button>

          <button
            onClick={() => onSelectPersona('producer')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              currentPersona === 'producer'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : isDark
                ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Producer (/producer)</span>
          </button>

          <button
            onClick={() => onSelectPersona('client')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              currentPersona === 'client'
                ? 'bg-indigo-600 text-white font-bold shadow-sm'
                : isDark
                ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Client (/client)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
