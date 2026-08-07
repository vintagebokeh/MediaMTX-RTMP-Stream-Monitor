import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { Activity, Clock, AlertOctagon, Zap, Maximize2, X } from 'lucide-react';
import { ChartErrorBoundary } from './ChartErrorBoundary';

interface ChartPoint {
  time: string;
  bitrateKbps: number | null;
  instantBitrateKbps?: number | null;
  averageBitrateKbps60s?: number | null;
  targetKbps: number | null;
  latencyMs: number | null;
  inboundErrors: number;
  discardedFrames: number;
}

interface BitrateChartProps {
  history: ChartPoint[];
  theme?: 'light' | 'dark';
}

export const BitrateChart: React.FC<BitrateChartProps> = ({ history = [], theme = 'light' }) => {
  const [metricTab, setMetricTab] = useState<'bitrate' | 'latency' | 'errors'>('bitrate');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showInstantBitrate, setShowInstantBitrate] = useState<boolean>(false);
  const [show60sAverage, setShow60sAverage] = useState<boolean>(false);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const isDark = theme === 'dark';

  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#cbd5e1';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';

  // Sanitize and validate history points
  const safeHistory = Array.isArray(history)
    ? history.filter(p => {
        const isValid = p && typeof p.time === 'string' && (p.bitrateKbps === null || typeof p.bitrateKbps === 'number');
        if (!isValid) {
          console.warn('[BitrateChart] Invalid data-shape detected in history sample:', p);
        }
        return isValid;
      })
    : [];

  // Manage body scroll locking and open/close diagnostic logs
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
      console.log(`[BitrateChart] Opened expanded view with ${safeHistory.length} samples`);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isExpanded, safeHistory.length]);

  // Handle Escape key listener
  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
        console.log('[BitrateChart] Closed expanded view via Escape key');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const handleCloseExpanded = () => {
    setIsExpanded(false);
    console.log('[BitrateChart] Closed expanded view');
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleCloseExpanded();
    }
  };

  const renderChartCanvas = (heightClass = 'h-64') => (
    <div className={`${heightClass} w-full pt-2 relative`}>
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        {metricTab === 'bitrate' ? (
          <LineChart data={safeHistory} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.6} />
            <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickLine={false} />
            <YAxis
              stroke={axisColor}
              fontSize={10}
              tickLine={false}
              domain={[0, 'auto']}
              unit=" Kbps"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderRadius: '0.5rem',
                fontSize: '11px',
                color: tooltipText
              }}
            />
            <ReferenceLine y={6000} label={{ value: '6000 Kbps Target', fill: '#10b981', fontSize: 10 }} stroke="#10b981" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="bitrateKbps"
              name="Smoothed Bitrate (EMA)"
              stroke="#10b981"
              strokeWidth={2}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
            {showInstantBitrate && (
              <Line
                type="monotone"
                dataKey="instantBitrateKbps"
                name="Instant Raw Bitrate"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                connectNulls={false}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {show60sAverage && (
              <Line
                type="monotone"
                dataKey="averageBitrateKbps60s"
                name="60s Moving Average"
                stroke="#3b82f6"
                strokeWidth={1.5}
                connectNulls={false}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        ) : metricTab === 'latency' ? (
          <LineChart data={safeHistory} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.6} />
            <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickLine={false} />
            <YAxis
              stroke={axisColor}
              fontSize={10}
              tickLine={false}
              domain={[1500, 2500]}
              unit=" ms"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderRadius: '0.5rem',
                fontSize: '11px',
                color: tooltipText
              }}
            />
            <ReferenceLine y={2000} label={{ value: 'Configured Target Buffer: 2000 ms', fill: '#6366f1', fontSize: 10 }} stroke="#6366f1" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="latencyMs"
              name="Configured Target Buffer"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        ) : (
          <LineChart data={safeHistory} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.6} />
            <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickLine={false} />
            <YAxis stroke={axisColor} fontSize={10} tickLine={false} domain={[0, 5]} />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderRadius: '0.5rem',
                fontSize: '11px',
                color: tooltipText
              }}
            />
            <Line
              type="stepAfter"
              dataKey="inboundErrors"
              name="Inbound Errors"
              stroke="#0284c7"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="discardedFrames"
              name="Discarded Frames"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );

  return (
    <>
      {/* Primary Card View */}
      <div
        className={`border rounded-xl p-5 shadow-sm space-y-4 font-sans transition-all ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header & Controls */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 font-mono">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span>Real-Time Stream Telemetry & Performance Charts</span>
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              1-second interval metrics history for stream bitrate, latency, and error counters
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Tab Selection */}
            <div className={`flex items-center space-x-1 p-1 rounded-lg border font-mono text-xs ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setMetricTab('bitrate')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                  metricTab === 'bitrate'
                    ? isDark
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                <span>Bitrate (6 Mbps)</span>
              </button>

              <button
                onClick={() => setMetricTab('latency')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                  metricTab === 'latency'
                    ? isDark
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Configured Target (2000ms)</span>
              </button>

              <button
                onClick={() => setMetricTab('errors')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                  metricTab === 'errors'
                    ? isDark
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-sky-100 text-sky-800 border border-sky-300'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5 text-sky-500" />
                <span>Inbound Errors</span>
              </button>
            </div>

            {/* Expand Modal Trigger Button */}
            <button
              onClick={() => setIsExpanded(true)}
              className={`p-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1 ${
                isDark
                  ? 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              title="Expand Chart View"
            >
              <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline font-mono">Expand</span>
            </button>
          </div>
        </div>

        {/* Chart Canvas with Error Boundary */}
        <ChartErrorBoundary fallbackMessage="Failed to render bitrate chart canvas.">
          {renderChartCanvas('h-64')}
        </ChartErrorBoundary>

        {/* Legend & Summary Notes */}
        <div className={`flex flex-wrap items-center justify-between text-xs border-t pt-3 gap-2 ${
          isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
        }`}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
              Target Bitrate: <strong className="font-mono">6000 Kbps (6 Mbps)</strong>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-indigo-500 rounded-full" />
              Target Latency: <strong className="font-mono">~2000 ms (2.0s)</strong>
            </span>
            {metricTab === 'bitrate' && (
              <div className="flex items-center space-x-3 pl-2 border-l border-slate-700 font-mono text-[11px]">
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showInstantBitrate}
                    onChange={(e) => setShowInstantBitrate(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-amber-500 font-semibold">Raw Instant (Byte Delta)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={show60sAverage}
                    onChange={(e) => setShow60sAverage(e.target.checked)}
                    className="rounded text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-blue-500 font-semibold">60s Avg</span>
                </label>
              </div>
            )}
          </div>

          <span className="font-mono text-[11px] opacity-75">
            Showing last {safeHistory.length} samples
          </span>
        </div>
      </div>

      {/* Expanded Modal Overlay */}
      {isExpanded && (
        <div
          ref={backdropRef}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div className={`w-full max-w-5xl rounded-2xl border p-6 shadow-2xl space-y-4 my-auto relative ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between border-b pb-4 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold font-mono tracking-tight">
                    Expanded Stream Telemetry Analyzer
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    High-resolution {safeHistory.length}-sample metrics timeline
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {/* Metric Selector in Modal */}
                <div className={`flex items-center space-x-1 p-1 rounded-lg border font-mono text-xs ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  <button
                    onClick={() => setMetricTab('bitrate')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                      metricTab === 'bitrate'
                        ? 'bg-emerald-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Bitrate
                  </button>
                  <button
                    onClick={() => setMetricTab('latency')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                      metricTab === 'latency'
                        ? 'bg-indigo-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Latency
                  </button>
                  <button
                    onClick={() => setMetricTab('errors')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                      metricTab === 'errors'
                        ? 'bg-sky-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Errors
                  </button>
                </div>

                {/* Explicit Close Button */}
                <button
                  onClick={handleCloseExpanded}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800'
                  }`}
                  title="Close Modal (Esc)"
                >
                  <X className="w-4 h-4 text-rose-500" />
                  <span>Close (Esc)</span>
                </button>
              </div>
            </div>

            {/* Modal Chart Canvas wrapped in Error Boundary */}
            <ChartErrorBoundary fallbackMessage="Unable to display expanded telemetry chart.">
              {renderChartCanvas('h-[450px]')}
            </ChartErrorBoundary>

            {/* Modal Footer Info */}
            <div className={`flex items-center justify-between text-xs pt-2 border-t ${
              isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center space-x-4 font-mono text-[11px]">
                <span>Status: <strong className="text-emerald-500">Live Active</strong></span>
                <span>Interval: <strong>1.0 sec</strong></span>
                <span>Total Samples: <strong>{safeHistory.length}</strong></span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">Press Escape or click outside to dismiss</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
