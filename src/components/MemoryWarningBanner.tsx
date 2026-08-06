import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, Zap, X } from 'lucide-react';
import { MemoryMetricsSummary } from '../types/memory';
import { getMemoryMonitorService } from '../services/memory/MemoryMonitorService';

interface MemoryWarningBannerProps {
  onOpenActions: () => void;
}

export const MemoryWarningBanner: React.FC<MemoryWarningBannerProps> = ({
  onOpenActions
}) => {
  const [metrics, setMetrics] = useState<MemoryMetricsSummary>(() =>
    getMemoryMonitorService().getMetricsSummary()
  );
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const memoryService = getMemoryMonitorService();
    setMetrics(memoryService.getMetricsSummary());

    const unsubscribe = memoryService.subscribe(() => {
      const newMetrics = memoryService.getMetricsSummary();
      setMetrics(newMetrics);

      // Reset dismiss state if severity elevates
      if (
        newMetrics.healthState === 'CRITICAL' ||
        newMetrics.healthState === 'EMERGENCY'
      ) {
        setIsDismissed(false);
      }
    });

    return unsubscribe;
  }, []);

  const {
    healthState,
    availableRAMPercent,
    availableRAMBytes,
    consumptionRateMBPerMin,
    projectedMinutesToCritical,
    latestSample
  } = metrics;

  if (
    isDismissed ||
    healthState === 'HEALTHY' ||
    healthState === 'WATCH'
  ) {
    return null;
  }

  const isEmergency = healthState === 'EMERGENCY';
  const isCritical = healthState === 'CRITICAL';

  const formatGb = (bytes: number | null) =>
    bytes ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB` : 'N/A';

  return (
    <div
      id="memory-warning-banner"
      className={`relative w-full px-4 py-3 border-y font-sans shadow-md animate-in slide-in-from-top-2 duration-200 ${
        isEmergency
          ? 'bg-purple-950 border-purple-600 text-purple-100'
          : isCritical
            ? 'bg-rose-950 border-rose-600 text-rose-100'
            : 'bg-amber-950 border-amber-600 text-amber-100'
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5">
          {isEmergency || isCritical ? (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          )}

          <div>
            <span className="font-bold uppercase tracking-wider underline mr-2">
              MEMORY HEALTH ALERT: {healthState}
            </span>
            <span>
              Available RAM: <strong className="font-mono">{formatGb(availableRAMBytes)} ({availableRAMPercent}%)</strong>
            </span>
            {consumptionRateMBPerMin !== null && (
              <span className="ml-2">
                | Decline Rate: <strong className="font-mono">{consumptionRateMBPerMin} MB/min</strong>
              </span>
            )}
            {projectedMinutesToCritical !== null && (
              <span className="ml-2">
                | Projected Critical: <strong className="font-mono">{projectedMinutesToCritical} min</strong>
              </span>
            )}
            {latestSample && (
              <span className="ml-2 hidden lg:inline text-opacity-80">
                (Videos: {latestSample.videoElementCount}, Loops: {latestSample.activeAnimationLoops})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenActions}
            className={`px-3 py-1 rounded font-semibold text-xs transition-colors shadow-sm ${
              isEmergency || isCritical
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            Operator Actions
          </button>

          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded hover:bg-white/10 text-slate-300 transition-colors"
            title="Dismiss notification banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
