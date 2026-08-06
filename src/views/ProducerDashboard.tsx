import React from 'react';
import { StreamPath, BackendHealth, RuntimeConfig } from '../types';
import { selectProducerViewModel } from '../selectors/producerViewModel';
import { IMonitorApiAdapter } from '../services/api/IMonitorApiAdapter';
import { LiveStreamInspector } from '../components/LiveStreamInspector';
import {
  Video,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Volume2,
  VolumeX,
  Clock,
  Users,
  Sun,
  Moon,
  RefreshCw,
  Layers,
  Gauge
} from 'lucide-react';

interface ProducerDashboardProps {
  paths: StreamPath[];
  health: BackendHealth | null;
  config: RuntimeConfig | null;
  selectedPathName: string;
  onSelectPath: (name: string) => void;
  adapter: IMonitorApiAdapter;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ProducerDashboard: React.FC<ProducerDashboardProps> = ({
  paths,
  health,
  config,
  selectedPathName,
  onSelectPath,
  adapter,
  theme,
  setTheme,
  onRefresh,
  isRefreshing
}) => {
  const isDark = theme === 'dark';
  const vm = selectProducerViewModel(paths, health, config);
  const currentPath = paths.find(p => p.name === (selectedPathName || vm.streamPath)) || paths[0] || null;

  // Format uptime cleanly
  const formatUptime = (seconds: number | null) => {
    if (seconds === null || seconds <= 0) return 'Offline';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getStatusBadge = () => {
    if (vm.status === 'online') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          OVERALL HEALTH: GOOD
        </span>
      );
    }
    if (vm.status === 'warning') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          OVERALL HEALTH: WARNING
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
        <XCircle className="w-3.5 h-3.5" />
        OVERALL HEALTH: OFFLINE
      </span>
    );
  };

  return (
    <div className={`min-h-screen font-sans ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Producer Header */}
      <header className={`border-b sticky top-0 z-30 backdrop-blur-md transition-colors ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-sm">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight">Producer Control Dashboard</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 uppercase">
                  PRODUCER VIEW
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stream production monitoring, ingest status & visual output verification
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {getStatusBadge()}

            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={`p-2 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
                isDark
                  ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
              }`}
              title="Refresh Stream Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
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

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stream Selector Bar if multiple streams exist */}
        {paths.length > 1 && (
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Production Path:</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {paths.map((p) => (
                <button
                  key={p.name}
                  onClick={() => onSelectPath(p.name)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                    p.name === (selectedPathName || vm.streamPath)
                      ? 'bg-indigo-600 text-white font-bold'
                      : isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current Stream Preview */}
        {currentPath && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-500" />
                Live Video Monitor Preview
              </h2>
              <span className="text-xs font-mono text-slate-500">
                Path: <strong className="text-indigo-500">{vm.streamPath}</strong>
              </span>
            </div>
            <LiveStreamInspector path={currentPath} theme={theme} adapter={adapter} />
          </div>
        )}

        {/* Simplified Production Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Live Status & Publisher */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Publisher Connected</span>
              <Radio className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-extrabold ${
                vm.publisherConnected ? 'text-emerald-500' : 'text-slate-400'
              }`}>
                {vm.publisherConnected ? 'Connected' : 'Disconnected'}
              </span>
              {vm.publisherConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <XCircle className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {vm.publisherConnected ? 'Active encoder sending stream' : 'Awaiting broadcaster connection'}
            </p>
          </div>

          {/* 2. Resolution & FPS */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Video Resolution & FPS</span>
              <Video className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-extrabold font-mono">
                {vm.publisherConnected ? `${vm.resolution || '1080p'} @ ${vm.frameRate || 60}fps` : 'N/A'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {vm.publisherConnected ? 'Frame rate & spatial resolution' : 'No incoming video signal'}
            </p>
          </div>

          {/* 3. Audio Detection */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Audio Channel</span>
              {vm.audioDetected ? (
                <Volume2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-extrabold ${
                vm.audioDetected ? 'text-emerald-500' : 'text-slate-400'
              }`}>
                {vm.audioDetected ? 'Audio Detected' : 'No Audio Detected'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {vm.audioDetected ? 'AAC stereo audio stream present' : 'Silent or audio channel omitted'}
            </p>
          </div>

          {/* 4. Current Latency */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Latency Status</span>
              <Gauge className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-extrabold font-mono text-indigo-500">
                {vm.latencyMs ? `${vm.latencyMs} ms` : 'N/A'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {vm.latencyMs && vm.latencyMs <= 3000 ? 'Low Latency' : 'Standard'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Glass-to-glass delay target configuration
            </p>
          </div>

          {/* 5. Reader / Viewer Count */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Active Viewers / Readers</span>
              <Users className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-extrabold font-mono text-emerald-500">
                {vm.readerCount}
              </span>
              <span className="text-xs text-slate-500">subscribers</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Simultaneous WebRTC & HLS output readers
            </p>
          </div>

          {/* 6. Stream Uptime */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Stream Uptime</span>
              <Clock className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-extrabold font-mono">
                {formatUptime(vm.uptimeSeconds)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Continuous live broadcast duration
            </p>
          </div>

          {/* 7. Stream Path Name */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Stream Identifier</span>
              <Radio className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-extrabold font-mono text-indigo-500 truncate">
                {vm.streamPath}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Active production stream key path
            </p>
          </div>

          {/* 8. Service Health summary */}
          <div className={`p-4 rounded-xl border shadow-sm space-y-2 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
              <span>Broadcast Health</span>
              <CheckCircle2 className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-base font-extrabold uppercase ${
                vm.status === 'online' ? 'text-emerald-500' : vm.status === 'warning' ? 'text-amber-500' : 'text-slate-400'
              }`}>
                {vm.status === 'online' ? 'Optimal' : vm.status === 'warning' ? 'Degraded' : 'Offline'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Last updated {vm.lastUpdated}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
