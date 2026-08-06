import React, { useEffect, useState } from 'react';
import {
  isTelemetryDebug,
  TelemetrySource,
  getAnimationLoopCount,
  addMemoryDiagnosticSample,
  MemoryDiagnosticSample
} from '../services/api/telemetryDebug';

export interface TelemetryDebugBadgeProps {
  healthStatus: 'healthy' | 'degraded' | 'stale';
  source: TelemetrySource;
  lastUpdateAgeMs: number | null;
  adapterInstanceId: string;
  subscriberCount: number;
}

export const TelemetryDebugBadge: React.FC<TelemetryDebugBadgeProps> = ({
  healthStatus,
  source,
  lastUpdateAgeMs,
  adapterInstanceId,
  subscriberCount
}) => {
  const [latestSample, setLatestSample] = useState<MemoryDiagnosticSample | null>(null);

  useEffect(() => {
    if (!isTelemetryDebug) return;

    const reportDiagnostics = () => {
      const perfMemory = (performance as any)?.memory;
      const sample: MemoryDiagnosticSample = {
        timestamp: new Date().toISOString(),
        usedJSHeapSize: perfMemory?.usedJSHeapSize,
        totalJSHeapSize: perfMemory?.totalJSHeapSize,
        activeVideoElements: document.getElementsByTagName('video').length,
        activeIframeElements: document.getElementsByTagName('iframe').length,
        activeCanvasElements: document.getElementsByTagName('canvas').length,
        activeAdapterInstanceId: adapterInstanceId,
        activeSubscriberCount: subscriberCount,
        activeTransportType: source,
        activeAnimationLoopCount: getAnimationLoopCount()
      };

      addMemoryDiagnosticSample(sample);
      setLatestSample(sample);
      console.log('[Memory Diagnostic]', sample);
    };

    reportDiagnostics();
    const timer = setInterval(reportDiagnostics, 10000);
    return () => clearInterval(timer);
  }, [adapterInstanceId, subscriberCount, source]);

  if (!isTelemetryDebug) {
    return null;
  }

  const getStatusColor = () => {
    switch (healthStatus) {
      case 'healthy':
        return 'bg-emerald-500';
      case 'degraded':
        return 'bg-amber-500';
      case 'stale':
        return 'bg-rose-500';
    }
  };

  const getStatusText = () => {
    switch (healthStatus) {
      case 'healthy':
        return 'TELEMETRY LIVE';
      case 'degraded':
        return 'DEGRADED';
      case 'stale':
        return 'STALE';
    }
  };

  const formattedAge =
    lastUpdateAgeMs !== null ? `${(lastUpdateAgeMs / 1000).toFixed(1)}s ago` : 'N/A';

  const formatSource = (src: TelemetrySource) => {
    switch (src) {
      case 'mock':
        return 'Mock';
      case 'websocket':
        return 'WebSocket';
      case 'http-polling':
        return 'HTTP Polling';
      default:
        return 'Unknown';
    }
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-mono shadow-lg border border-slate-700/80 backdrop-blur-md transition-all duration-200 pointer-events-auto"
      title="Telemetry Lifecycle Debug Indicator (VITE_TELEMETRY_DEBUG=true)"
    >
      <span className={`w-2 h-2 rounded-full animate-pulse ${getStatusColor()}`} />
      <span className="font-semibold tracking-wider text-[11px]">{getStatusText()}</span>
      <span className="text-slate-500">|</span>
      <span className="text-slate-300">{formatSource(source)}</span>
      <span className="text-slate-500">|</span>
      <span className="text-slate-400">{formattedAge}</span>
      <span className="text-slate-500">|</span>
      <span className="text-slate-400 font-bold">{adapterInstanceId}</span>
      <span className="text-slate-500">|</span>
      <span className="text-slate-400">subs:{subscriberCount}</span>
    </div>
  );
};
