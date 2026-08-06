import React, { useEffect, useRef } from 'react';
import { StreamPath, BackendHealth, RuntimeConfig } from '../types';
import { selectClientViewModel } from '../selectors/clientViewModel';
import {
  Tv,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Users,
  Sun,
  Moon,
  Sparkles,
  RefreshCw,
  Signal
} from 'lucide-react';

interface ClientDashboardProps {
  paths: StreamPath[];
  health: BackendHealth | null;
  config: RuntimeConfig | null;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  paths,
  health,
  config,
  theme,
  setTheme,
  onRefresh,
  isRefreshing
}) => {
  const isDark = theme === 'dark';
  const vm = selectClientViewModel(paths, health, config);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const currentIframe = iframeRef.current;
    return () => {
      if (currentIframe) {
        try {
          currentIframe.src = 'about:blank';
        } catch (_) {}
      }
    };
  }, [vm.previewUrl]);

  // Format start time nicely
  const formatStartTime = (isoString: string | null) => {
    if (!isoString) return 'Not Started';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Not Started';
    }
  };

  // Format uptime
  const formatUptime = (seconds: number | null) => {
    if (seconds === null || seconds <= 0) return 'Offline';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getStatusIcon = () => {
    if (vm.status === 'online') {
      return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
    }
    if (vm.status === 'warning') {
      return <AlertTriangle className="w-6 h-6 text-amber-500" />;
    }
    return <XCircle className="w-6 h-6 text-rose-500" />;
  };

  const getStatusBannerColor = () => {
    if (vm.status === 'online') {
      return isDark
        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
        : 'bg-emerald-50 border-emerald-200 text-emerald-900';
    }
    if (vm.status === 'warning') {
      return isDark
        ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
        : 'bg-amber-50 border-amber-200 text-amber-900';
    }
    return isDark
      ? 'bg-slate-900 border-slate-800 text-slate-300'
      : 'bg-slate-100 border-slate-200 text-slate-800';
  };

  const getQualityBadgeColor = () => {
    switch (vm.qualityLabel) {
      case 'Excellent':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'Good':
        return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30';
      case 'Degraded':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className={`min-h-screen font-sans ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      <header className={`border-b sticky top-0 z-30 backdrop-blur-md transition-colors ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'
      }`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-md">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">{vm.serviceName}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official Broadcast Service Status & Preview Portal
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={`p-2 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
                isDark
                  ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Check Status</span>
            </button>

            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`p-2 rounded-lg border text-xs transition ${
                isDark
                  ? 'border-slate-800 bg-slate-900 text-amber-400 hover:bg-slate-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Prominent Public Status Banner */}
        <div className={`p-5 rounded-2xl border shadow-sm flex items-center space-x-4 ${getStatusBannerColor()}`}>
          <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm">
            {getStatusIcon()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-80">Current Service Status</span>
              <span className="text-[10px] font-mono opacity-60">Updated {vm.lastUpdated}</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight mt-0.5">{vm.publicStatusMessage}</h2>
          </div>
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">Quality Rating</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border mt-1 ${getQualityBadgeColor()}`}>
              {vm.qualityLabel}
            </span>
          </div>
        </div>

        {/* Stream Video Player or Offline Card */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Signal className={`w-4 h-4 ${vm.status === 'online' ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Live Preview Output
              </span>
            </div>
            {vm.status === 'online' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                BROADCAST LIVE
              </span>
            )}
          </div>

          <div className="aspect-video w-full relative bg-slate-950 flex items-center justify-center">
            {vm.status === 'online' || vm.status === 'warning' ? (
              vm.previewUrl ? (
                <iframe
                  ref={iframeRef}
                  src={vm.previewUrl}
                  title="Live Broadcast Preview"
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen"
                />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <div className="inline-flex p-4 rounded-full bg-indigo-500/10 text-indigo-400">
                    <Tv className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-200">Broadcast Stream Initializing</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    The live broadcast feed is connected. Preparing media player...
                  </p>
                </div>
              )
            ) : (
              <div className="text-center p-8 space-y-3">
                <div className="inline-flex p-4 rounded-full bg-slate-800 text-slate-400">
                  <Tv className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-200">Broadcast Temporarily Unavailable</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  The live stream is currently offline. Check back shortly for the next live broadcast.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Public Status Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Overall Stream Quality */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-1.5 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Broadcast Quality</span>
              <Sparkles className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-extrabold ${
                vm.qualityLabel === 'Excellent' || vm.qualityLabel === 'Good'
                  ? 'text-emerald-500'
                  : vm.qualityLabel === 'Degraded'
                  ? 'text-amber-500'
                  : 'text-slate-400'
              }`}>
                {vm.qualityLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Overall stream delivery performance
            </p>
          </div>

          {/* 2. Broadcast Start Time */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-1.5 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Broadcast Start</span>
              <Clock className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-extrabold font-mono">
                {formatStartTime(vm.startTime)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Time the current session went live
            </p>
          </div>

          {/* 3. Stream Uptime */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-1.5 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Live Duration</span>
              <Clock className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-extrabold font-mono">
                {formatUptime(vm.uptimeSeconds)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Total active broadcast runtime
            </p>
          </div>

          {/* 4. Active Viewer Count */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-1.5 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Active Audience</span>
              <Users className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-emerald-500">
                {vm.viewerCount ?? 0}
              </span>
              <span className="text-xs text-slate-500">viewers live</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Current active stream viewers
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
