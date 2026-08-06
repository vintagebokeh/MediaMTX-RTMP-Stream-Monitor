import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  HardDrive,
  Info,
  ShieldAlert,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  HelpCircle,
  Video,
  Monitor,
  Cpu
} from 'lucide-react';
import { MemoryMetricsSummary } from '../types/memory';
import { getMemoryMonitorService } from '../services/memory/MemoryMonitorService';

interface MemoryHealthCardProps {
  theme?: 'light' | 'dark';
  onOpenEmergencyActions?: () => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || isNaN(bytes)) return 'Unavailable';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatTrend(bytes: number | null): string {
  if (bytes === null || isNaN(bytes)) return 'Stable';
  const mb = bytes / (1024 * 1024);
  if (Math.abs(mb) < 1) return 'Stable';
  const sign = mb > 0 ? '+' : '';
  return `${sign}${mb.toFixed(0)} MB / 15m`;
}

export const MemoryHealthCard: React.FC<MemoryHealthCardProps> = ({
  theme = 'dark',
  onOpenEmergencyActions
}) => {
  const isDark = theme === 'dark';
  const [metrics, setMetrics] = useState<MemoryMetricsSummary>(() =>
    getMemoryMonitorService().getMetricsSummary()
  );

  useEffect(() => {
    const memoryService = getMemoryMonitorService();
    setMetrics(memoryService.getMetricsSummary());

    const unsubscribe = memoryService.subscribe(() => {
      setMetrics(memoryService.getMetricsSummary());
    });

    return unsubscribe;
  }, []);

  const {
    healthState,
    hostHealthState,
    browserHeapHealthState,
    overallHealthState,
    baselineState,
    leakSuspicion,
    suspicionReason,
    availableRAMBytes,
    usedRAMBytes,
    totalRAMBytes,
    availableRAMPercent,
    hostMemorySourceApi,
    browserHeap,
    resourceCounts,
    consumptionRateMBPerMin,
    trend15MinBytes,
    projectedMinutesToCritical,
    lastSampleTime,
    lastIncident,
    lastRecovery
  } = metrics;

  const getHealthBadge = (state: string) => {
    switch (state) {
      case 'HEALTHY':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          label: 'HEALTHY'
        };
      case 'WATCH':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          icon: <Info className="w-4 h-4 text-amber-400" />,
          label: 'WATCH'
        };
      case 'WARNING':
        return {
          bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
          icon: <AlertTriangle className="w-4 h-4 text-orange-400" />,
          label: 'WARNING'
        };
      case 'CRITICAL':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse',
          icon: <ShieldAlert className="w-4 h-4 text-rose-400" />,
          label: 'CRITICAL'
        };
      case 'EMERGENCY':
        return {
          bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40 animate-bounce',
          icon: <ShieldAlert className="w-4 h-4 text-purple-300" />,
          label: 'EMERGENCY'
        };
      default:
        return {
          bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
          icon: <Info className="w-4 h-4 text-slate-400" />,
          label: state
        };
    }
  };

  const getLeakBadge = () => {
    switch (leakSuspicion) {
      case 'STABLE':
        return {
          bg: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          label: 'STABLE'
        };
      case 'POSSIBLE_LEAK':
        return {
          bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          label: 'POSSIBLE_LEAK'
        };
      case 'LIKELY_LEAK':
        return {
          bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse',
          label: 'LIKELY_LEAK'
        };
    }
  };

  const hostBadge = getHealthBadge(hostHealthState || healthState);
  const browserBadge = getHealthBadge(browserHeapHealthState);
  const leakBadge = getLeakBadge();

  const getTrendIcon = (trend: string) => {
    if (trend === 'RISING') return <TrendingUp className="w-4 h-4 text-rose-400" />;
    if (trend === 'FALLING') return <TrendingDown className="w-4 h-4 text-emerald-400" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div
      id="memory-health-card"
      className={`rounded-xl border p-5 transition-all shadow-sm space-y-4 ${
        isDark
          ? 'bg-slate-900/80 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-700/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base tracking-tight">Memory Health & Protection Engine</h3>
            <p className="text-xs text-slate-400">Host RAM, Browser JS Heap & Resource Correlation</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Host Memory Pressure Badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${hostBadge.bg}`}
            title="Host OS System RAM Pressure"
          >
            {hostBadge.icon}
            <span>HOST RAM: {hostBadge.label}</span>
          </span>

          {/* Browser Heap Health Badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${browserBadge.bg}`}
            title="Browser JavaScript Heap Memory"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>BROWSER HEAP: {browserBadge.label}</span>
          </span>

          {/* Leak Suspicion Badge */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono font-medium ${leakBadge.bg}`}
            title="Correlation Leak Classifier"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>LEAK: {leakBadge.label}</span>
          </span>

          {/* Baseline Status Badge */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono ${
              baselineState === 'READY'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {baselineState}
          </span>

          {onOpenEmergencyActions && overallHealthState !== 'HEALTHY' && (
            <button
              onClick={onOpenEmergencyActions}
              className="ml-2 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-sm"
            >
              Emergency Actions
            </button>
          )}
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Host Available RAM */}
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
            <span>HOST RAM</span>
          </div>
          <div className="text-lg font-bold font-mono">
            {formatBytes(availableRAMBytes)} free
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 space-y-0.5 font-mono">
            <div>Used: {formatBytes(usedRAMBytes)} / Total: {formatBytes(totalRAMBytes)}</div>
            <div className="text-[10px] text-indigo-300 truncate" title={hostMemorySourceApi || 'Node.js os.totalmem() / os.freemem()'}>
              Source: {hostMemorySourceApi || 'os.totalmem() / os.freemem()'}
            </div>
          </div>
        </div>

        {/* Metric 2: Browser Heap Used */}
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Browser Heap</span>
            </span>
            {getTrendIcon(browserHeap.trend)}
          </div>
          <div className="text-lg font-bold font-mono">
            {formatBytes(browserHeap.usedBytes)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5 font-mono">
            Usage: {browserHeap.usagePercent !== null ? `${browserHeap.usagePercent}%` : 'N/A'}
          </div>
        </div>

        {/* Metric 3: Heap Growth Rate */}
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span>Heap Growth</span>
          </div>
          <div className={`text-lg font-bold font-mono ${
            (browserHeap.growthRateMBPerMin ?? 0) > 25 ? 'text-amber-400' : 'text-slate-200'
          }`}>
            {browserHeap.growthRateMBPerMin !== null
              ? `${browserHeap.growthRateMBPerMin > 0 ? '+' : ''}${browserHeap.growthRateMBPerMin} MB/m`
              : '0 MB/m'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            5m Rate
          </div>
        </div>

        {/* Metric 4: Peak Heap */}
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Peak Heap</span>
          </div>
          <div className="text-lg font-bold font-mono">
            {formatBytes(browserHeap.peakBytes)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Lowest: {formatBytes(browserHeap.lowestBytes)}
          </div>
        </div>

        {/* Metric 5: Projected Critical */}
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Projected Critical</span>
          </div>
          <div className={`text-base font-bold font-mono ${
            projectedMinutesToCritical !== null ? 'text-rose-400' : 'text-slate-400'
          }`}>
            {projectedMinutesToCritical !== null
              ? `${projectedMinutesToCritical} min`
              : 'Sustained ok'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Threshold &lt; 10%
          </div>
        </div>

        {/* Metric 6: Resource Summary */}
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between gap-1 text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Resource Census</span>
            </span>
            <span className={`text-[10px] font-mono px-1 rounded ${
              resourceCounts.censusState === 'READY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {resourceCounts.censusState}
            </span>
          </div>
          <div className="text-[11px] font-mono space-y-0.5">
            <div>Iframes: {resourceCounts.iframeElements} | Video (DOM): {resourceCounts.videoElements}</div>
            <div>Canvas: {resourceCounts.canvasElements} | Loops: {resourceCounts.activeAnimationLoops} | Timers: {resourceCounts.activeTimers}</div>
            {resourceCounts.videoInIframeStatus === 'unavailable' && (
              <div className="text-[10px] text-amber-400/90 truncate" title="WHEP player inside iframe: inner video/RTCPeerConnection elements concealed cross-origin">
                Iframe Player: Video/RTC inner count unavailable
              </div>
            )}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 truncate">
            Last Sample: {lastSampleTime ? new Date(lastSampleTime).toLocaleTimeString() : 'N/A'}
          </div>
        </div>
      </div>

      {/* Resource & Correlation Suspicion Banner */}
      {suspicionReason && (
        <div className={`p-3 rounded-lg border flex items-start gap-3 ${
          leakSuspicion === 'LIKELY_LEAK'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            : leakSuspicion === 'POSSIBLE_LEAK'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-slate-800/40 border-slate-700/50 text-slate-300'
        }`}>
          <HelpCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
          <div className="text-xs space-y-1">
            <div className="font-semibold tracking-wide">Diagnostic Correlation Suspicion</div>
            <p className="opacity-90">{suspicionReason}</p>
          </div>
        </div>
      )}

      {/* Last Incident & Recovery Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-2 border-t border-slate-800">
        <div>
          <span className="font-semibold text-slate-300">Last Incident: </span>
          {lastIncident
            ? `${new Date(lastIncident.timestamp).toLocaleTimeString()} (${lastIncident.overallHealthState})`
            : 'None recorded'}
        </div>
        <div>
          <span className="font-semibold text-slate-300">Last Recovery: </span>
          {lastRecovery
            ? new Date(lastRecovery.timestamp).toLocaleTimeString()
            : 'None required'}
        </div>
      </div>
    </div>
  );
};
