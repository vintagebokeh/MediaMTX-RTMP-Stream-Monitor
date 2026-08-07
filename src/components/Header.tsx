import React from 'react';
import {
  Activity,
  Radio,
  Server,
  Settings,
  RefreshCw,
  PlusCircle,
  Terminal,
  Cpu,
  FlaskConical,
  Sun,
  Moon
} from 'lucide-react';
import { AppEnv, BackendHealth, ConnectionConfig } from '../types';

interface HeaderProps {
  health: BackendHealth | null;
  config: ConnectionConfig;
  activeTab: 'overview' | 'telemetry' | 'host' | 'experiments' | 'logs';
  setActiveTab: (tab: 'overview' | 'telemetry' | 'host' | 'experiments' | 'logs') => void;
  onOpenSettings: () => void;
  onOpenNewPath: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  config,
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenNewPath,
  onRefresh,
  isRefreshing,
  theme,
  onToggleTheme
}) => {
  const isDark = theme === 'dark';

  const getEnvBadgeColor = (env: AppEnv) => {
    switch (env) {
      case 'local':
        return isDark
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'lan':
        return isDark
          ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
          : 'bg-blue-100 text-blue-800 border-blue-300';
      case 'remote':
        return isDark
          ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
          : 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-slate-200 text-slate-700 border-slate-300';
    }
  };

  return (
    <header
      className={`sticky top-0 z-30 border-b shadow-sm ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Top Banner Bar - High Density */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Logo & High-Density Status Title */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-sm shrink-0">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-extrabold font-mono tracking-tight">
                  MediaMTX RTMP Monitor <span className="text-xs text-indigo-500">// V2.4</span>
                </h1>
                
                {/* Mode & Environment Badges */}
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase font-mono tracking-wider ${getEnvBadgeColor(
                    config.appEnv
                  )}`}
                >
                  {config.appEnv}
                </span>

                {(() => {
                  const isMock = config.useMockData || health?.runtimeDiagnostics?.dataMode === 'mock' || health?.mockMode === true;
                  if (isMock) {
                    return (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded border font-mono ${
                          isDark
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        Mock Mode
                      </span>
                    );
                  }

                  const isBackendOffline = !health || health.status === 'offline' || health.status === 'error' || (health.runtimeDiagnostics && !health.runtimeDiagnostics.backendReachable);
                  if (isBackendOffline) {
                    return (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded border font-mono ${
                          isDark
                            ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        BACKEND OFFLINE
                      </span>
                    );
                  }

                  const isMediaMtxOffline = health.mediamtxConnected === false || (health.runtimeDiagnostics && !health.runtimeDiagnostics.mediaMtxApiReachable);
                  if (isMediaMtxOffline) {
                    return (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded border font-mono ${
                          isDark
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        MEDIAMTX OFFLINE
                      </span>
                    );
                  }

                  const hasActiveStream = health.activePathsCount > 0 && health.measuredBitrateKbps !== null;
                  if (!hasActiveStream) {
                    return (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded border font-mono ${
                          isDark
                            ? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        NO SIGNAL
                      </span>
                    );
                  }

                  return (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded border font-mono ${
                        isDark
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      REAL DATA
                    </span>
                  );
                })()}
              </div>
              
              <div className={`flex items-center space-x-2.5 text-[11px] font-mono mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      health?.mediamtxConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                    }`}
                  />
                  {health?.mediamtxConnected ? 'MediaMTX API OK' : 'MediaMTX Standalone'}
                </span>
                <span>•</span>
                <span>Port 3000 Ingress</span>
                <span>•</span>
                <span className="opacity-75">No Direct 9997/9998 Browser Calls</span>
              </div>
            </div>
          </div>

          {/* Metrics & Actions - Compact Density */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Total Bitrate Pill */}
            <div
              className={`border rounded-lg px-2.5 py-1 text-xs font-mono flex items-center gap-1.5 ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Live Bitrate:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {health && health.measuredBitrateKbps != null ? `${(health.measuredBitrateKbps / 1000).toFixed(2)} Mbps` : '--'}
              </span>
              {health?.configuredTargetBitrateKbps && (
                <span className="text-[10px] opacity-75 ml-1">
                  (Target: {(health.configuredTargetBitrateKbps / 1000).toFixed(2)} Mbps)
                </span>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={`p-1.5 rounded-lg border text-xs transition flex items-center justify-center ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`} />
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-indigo-700 border-slate-300'
              }`}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} Theme`}
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
              <span className="font-mono text-[11px]">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            {/* New Path Button */}
            <button
              onClick={onOpenNewPath}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create Path</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1 ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Endpoints & Env</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs - High Density */}
        <div className={`flex items-center space-x-1 mt-3 pt-2 border-t font-mono text-xs overflow-x-auto ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? isDark
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Stream Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'telemetry'
                ? isDark
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Bitrate & Latency Charts</span>
          </button>

          <button
            onClick={() => setActiveTab('host')}
            className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'host'
                ? isDark
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Host Operating System</span>
          </button>

          <button
            onClick={() => setActiveTab('experiments')}
            className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'experiments'
                ? isDark
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Latency Experiments</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? isDark
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                : isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>
        </div>

      </div>
    </header>
  );
};

