import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Search, Copy, Check, Filter } from 'lucide-react';
import { LogEntry } from '../types';

interface LogsViewerProps {
  logs: LogEntry[];
  theme?: 'light' | 'dark';
}

export const LogsViewer: React.FC<LogsViewerProps> = ({ logs, theme = 'light' }) => {
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const isDark = theme === 'dark';

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 2000);
  };

  const getLevelBadge = (level: LogEntry['level']) => {
    switch (level) {
      case 'info':
        return isDark
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'warn':
        return isDark
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          : 'bg-amber-100 text-amber-800 border-amber-300';
      case 'error':
        return isDark
          ? 'bg-red-500/15 text-red-400 border-red-500/30'
          : 'bg-red-100 text-red-800 border-red-300';
      default:
        return isDark
          ? 'bg-slate-800 text-slate-400 border-slate-700'
          : 'bg-slate-200 text-slate-700 border-slate-300';
    }
  };

  return (
    <div
      className={`border rounded-xl p-5 shadow-sm space-y-4 font-sans ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      
      {/* Header Controls */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-3 ${
        isDark ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 font-mono">
            <Terminal className="w-4 h-4 text-indigo-500" />
            <span>Stream Audit & System Event Logs</span>
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Real-time event logging for MediaMTX RTMP connections and control API operations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono">
          {/* Search Box */}
          <div className="relative">
            <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2 ${
              isDark ? 'text-slate-500' : 'text-slate-400'
            }`} />
            <input
              type="text"
              placeholder="Filter logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`border text-xs rounded-lg pl-8 pr-2.5 py-1 focus:outline-none focus:border-indigo-500 w-40 ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-200'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          {/* Level Filter dropdown */}
          <div className={`flex items-center space-x-1 border rounded-lg p-0.5 text-xs ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
            {['all', 'info', 'warn', 'error'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2 py-0.5 rounded uppercase font-semibold text-[10px] transition ${
                  filterLevel === lvl
                    ? 'bg-indigo-600 text-white'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopyLogs}
            className={`px-2.5 py-1 border rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Log Entries Terminal Window */}
      <div className={`border rounded-lg p-3 font-mono text-xs h-72 overflow-y-auto space-y-1.5 scrollbar-thin ${
        isDark ? 'bg-slate-950 border-slate-800/80 text-slate-300' : 'bg-slate-950 border-slate-900 text-slate-200'
      }`}>
        {filteredLogs.length > 0 ? (
          filteredLogs.map((l) => (
            <div key={l.id} className="flex items-start space-x-2 py-0.5 border-b border-slate-900/60 leading-relaxed text-[11px]">
              <span className="text-slate-500 shrink-0">
                {new Date(l.timestamp).toLocaleTimeString()}
              </span>
              <span className={`px-1 py-0.2 text-[9px] uppercase font-bold rounded border shrink-0 ${getLevelBadge(l.level)}`}>
                {l.level}
              </span>
              <span className="text-indigo-400 font-bold shrink-0">[{l.source}]</span>
              <span className="break-all">{l.message}</span>
            </div>
          ))
        ) : (
          <div className="text-slate-500 text-center py-12">
            No log entries matching filter criteria
          </div>
        )}
      </div>

    </div>
  );
};

