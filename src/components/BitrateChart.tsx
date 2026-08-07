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
import {
  Activity,
  Clock,
  AlertOctagon,
  Zap,
  Maximize2,
  X,
  RotateCcw,
  ArrowUpRight,
  ArrowDownRight,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Sliders
} from 'lucide-react';
import { ChartErrorBoundary } from './ChartErrorBoundary';
import {
  ChartViewportState,
  DEFAULT_VIEWPORT_STATE,
  TimeRangeOption,
  YScaleMode,
  ChartPointInput,
  filterHistoryByTimeRange,
  aggregateHistoryBuckets,
  calculateYAxisBounds,
  validateManualYBounds
} from '../policies/chartViewportPolicy';

interface ChartPoint extends ChartPointInput {}

interface BitrateChartProps {
  history: ChartPoint[];
  theme?: 'light' | 'dark';
  configuredTargetBitrateKbps?: number;
}

const TIME_RANGES: { label: string; value: TimeRangeOption }[] = [
  { label: '30s', value: '30s' },
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '3h', value: '3h' },
  { label: 'All', value: 'all' },
];

export const BitrateChart: React.FC<BitrateChartProps> = ({
  history = [],
  theme = 'light',
  configuredTargetBitrateKbps = 6000
}) => {
  const [metricTab, setMetricTab] = useState<'bitrate' | 'latency' | 'errors'>('bitrate');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showInstantBitrate, setShowInstantBitrate] = useState<boolean>(false);
  const [show60sAverage, setShow60sAverage] = useState<boolean>(false);

  // Centralized Chart Viewport State
  const [viewport, setViewport] = useState<ChartViewportState>(DEFAULT_VIEWPORT_STATE);
  const [manualMinInput, setManualMinInput] = useState<string>('0');
  const [manualMaxInput, setManualMaxInput] = useState<string>('8000');
  const [manualError, setManualError] = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement | null>(null);
  const isDark = theme === 'dark';

  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#cbd5e1';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';

  // Sanitize history points without mutating original history
  const safeHistory: ChartPoint[] = Array.isArray(history)
    ? history.filter((p) => {
        const isValid =
          p && typeof p.time === 'string' && (p.bitrateKbps === null || typeof p.bitrateKbps === 'number');
        return isValid;
      })
    : [];

  // Filter and Aggregate History
  const { filtered, startTs, endTs } = filterHistoryByTimeRange(safeHistory, viewport);
  const aggregatedBuckets = aggregateHistoryBuckets(filtered, viewport.timeRange);

  // Target Bitrate for Reference Line
  const targetKbps =
    configuredTargetBitrateKbps ??
    aggregatedBuckets[aggregatedBuckets.length - 1]?.targetKbps ??
    6000;

  // Calculate Y Axis Bounds & Target Indicator Status
  const yAxisResult = calculateYAxisBounds(
    aggregatedBuckets,
    viewport.yScaleMode,
    targetKbps,
    viewport.yMinKbps,
    viewport.yMaxKbps
  );

  // Lock body scroll in expanded modal
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  // Escape key handler
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const handleResetView = () => {
    setViewport(DEFAULT_VIEWPORT_STATE);
    setManualMinInput('0');
    setManualMaxInput('8000');
    setManualError(null);
  };

  const handleTimeRangeChange = (range: TimeRangeOption) => {
    setViewport((prev) => ({
      ...prev,
      timeRange: range,
      viewportStart: null,
      viewportEnd: null
    }));
  };

  const handleYScaleModeChange = (mode: YScaleMode) => {
    setManualError(null);
    if (mode === 'manual') {
      const min = parseFloat(manualMinInput);
      const max = parseFloat(manualMaxInput);
      const val = validateManualYBounds(min, max);
      if (val.isValid) {
        setViewport((prev) => ({
          ...prev,
          yScaleMode: 'manual',
          yMinKbps: min,
          yMaxKbps: max
        }));
      } else {
        setManualError(val.errorMessage || 'Invalid manual bounds');
      }
    } else {
      setViewport((prev) => ({
        ...prev,
        yScaleMode: mode,
        yMinKbps: null,
        yMaxKbps: null
      }));
    }
  };

  const handleApplyManualY = () => {
    const min = parseFloat(manualMinInput);
    const max = parseFloat(manualMaxInput);
    const val = validateManualYBounds(min, max);
    if (val.isValid) {
      setManualError(null);
      setViewport((prev) => ({
        ...prev,
        yScaleMode: 'manual',
        yMinKbps: min,
        yMaxKbps: max
      }));
    } else {
      setManualError(val.errorMessage || 'Invalid manual bounds');
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (aggregatedBuckets.length < 2) return;
    const effectiveStart = startTs ?? aggregatedBuckets[0].timestampMs;
    const effectiveEnd = endTs ?? aggregatedBuckets[aggregatedBuckets.length - 1].timestampMs;
    const center = (effectiveStart + effectiveEnd) / 2;
    const currentSpan = effectiveEnd - effectiveStart;

    const factor = direction === 'in' ? 0.7 : 1.4;
    const newSpan = Math.max(10000, currentSpan * factor); // minimum 10s window

    setViewport((prev) => ({
      ...prev,
      viewportStart: Math.round(center - newSpan / 2),
      viewportEnd: Math.round(center + newSpan / 2)
    }));
  };

  const handlePan = (direction: 'left' | 'right') => {
    if (aggregatedBuckets.length < 2) return;
    const effectiveStart = startTs ?? aggregatedBuckets[0].timestampMs;
    const effectiveEnd = endTs ?? aggregatedBuckets[aggregatedBuckets.length - 1].timestampMs;
    const span = effectiveEnd - effectiveStart;
    const shift = Math.round(span * 0.25) * (direction === 'left' ? -1 : 1);

    setViewport((prev) => ({
      ...prev,
      viewportStart: effectiveStart + shift,
      viewportEnd: effectiveEnd + shift
    }));
  };

  // Custom Tooltip Renderer
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          className={`p-3 rounded-lg border text-xs font-mono shadow-xl backdrop-blur-md ${
            isDark ? 'bg-slate-900/95 border-slate-700 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
          }`}
        >
          <div className="font-bold border-b pb-1 mb-1.5 border-slate-700/40 flex justify-between items-center gap-4">
            <span>Time: {label}</span>
            {data.sampleCount > 1 && (
              <span className="text-[10px] text-indigo-400 font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10">
                {data.sampleCount} samples/bucket
              </span>
            )}
          </div>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 py-0.5">
              <span style={{ color: entry.color }} className="font-semibold">
                {entry.name}:
              </span>
              <span className="font-bold font-mono">
                {entry.value !== null && entry.value !== undefined ? `${entry.value} Kbps` : 'OFFLINE'}
              </span>
            </div>
          ))}
          {data.sampleCount > 1 && data.minKbps !== null && data.maxKbps !== null && (
            <div className="mt-2 pt-1.5 border-t border-slate-700/40 text-[10px] text-slate-400 space-y-0.5">
              <div className="flex justify-between gap-2">
                <span>Range Min - Max:</span>
                <span className="font-mono font-semibold text-slate-200">
                  {data.minKbps} – {data.maxKbps} Kbps
                </span>
              </div>
              {data.hasNull && (
                <div className="text-amber-400 font-bold text-[10px] flex items-center gap-1 mt-0.5">
                  <AlertOctagon className="w-3 h-3" />
                  <span>Bucket includes 0/Offline Drop</span>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const renderChartCanvas = (heightClass = 'h-64') => (
    <div className={`${heightClass} w-full pt-2 relative`}>
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        {metricTab === 'bitrate' ? (
          <LineChart data={aggregatedBuckets} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.6} />
            <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickLine={false} />
            <YAxis
              stroke={axisColor}
              fontSize={10}
              tickLine={false}
              domain={yAxisResult.domain}
              unit=" Kbps"
            />
            <Tooltip content={<CustomTooltip />} />
            {!yAxisResult.isTargetOutside && (
              <ReferenceLine
                y={targetKbps}
                label={{
                  value: `${targetKbps} Kbps Target`,
                  fill: '#10b981',
                  fontSize: 10,
                  position: 'insideTopRight'
                }}
                stroke="#10b981"
                strokeDasharray="4 4"
              />
            )}
            <Line
              type="monotone"
              dataKey="bitrateKbps"
              name="Bitrate (Avg/Smoothed)"
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
                name="60s Moving Avg"
                stroke="#3b82f6"
                strokeWidth={1.5}
                connectNulls={false}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        ) : metricTab === 'latency' ? (
          <LineChart data={aggregatedBuckets} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.6} />
            <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickLine={false} />
            <YAxis
              stroke={axisColor}
              fontSize={10}
              tickLine={false}
              domain={[1500, 2500]}
              unit=" ms"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={2000}
              label={{ value: 'Target Buffer: 2000 ms', fill: '#6366f1', fontSize: 10 }}
              stroke="#6366f1"
              strokeDasharray="4 4"
            />
            <Line
              type="monotone"
              dataKey="latencyMs"
              name="Buffer Latency"
              stroke="#6366f1"
              strokeWidth={2}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        ) : (
          <LineChart data={aggregatedBuckets} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.6} />
            <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickLine={false} />
            <YAxis stroke={axisColor} fontSize={10} tickLine={false} domain={[0, 'auto']} />
            <Tooltip content={<CustomTooltip />} />
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
      <div
        className={`border rounded-xl p-5 shadow-sm space-y-4 font-sans transition-all ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Main Title Row */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 font-mono">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span>Real-Time Telemetry & Time-Scale Viewport</span>
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Inspect telemetry with time-range filtering, bounded bucket aggregation, and Y-scale viewport modes
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Metric Tab Selector */}
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
                <span>Bitrate</span>
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
                <span>Latency</span>
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
                <span>Errors</span>
              </button>
            </div>

            <button
              onClick={() => setIsExpanded(true)}
              className={`p-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1 ${
                isDark
                  ? 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              title="Expand Analyzer View"
            >
              <Maximize2 className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline font-mono text-[11px]">Expand</span>
            </button>
          </div>
        </div>

        {/* Viewport Control Panel Bar */}
        <div className={`p-3 rounded-lg border space-y-2.5 ${
          isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
        }`}>
          {/* Row 1: Time Range Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Time Window:</span>
              </span>
              <div className="flex items-center space-x-1">
                {TIME_RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => handleTimeRangeChange(r.value)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                      viewport.timeRange === r.value && viewport.viewportStart === null
                        ? isDark
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'bg-indigo-600 text-white font-bold'
                        : isDark
                        ? 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset View Button */}
            <button
              onClick={handleResetView}
              className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition flex items-center gap-1 ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
              }`}
              title="Reset Viewport to Default"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset View</span>
            </button>
          </div>

          {/* Row 2: Y Scale Mode & Zoom/Pan Interaction Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono pt-1 border-t border-slate-800/40">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Y Scale:</span>
              </span>
              <div className="flex items-center space-x-1">
                {(['auto', 'target', 'manual'] as YScaleMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleYScaleModeChange(mode)}
                    className={`px-2 py-0.5 rounded text-xs font-medium uppercase transition ${
                      viewport.yScaleMode === mode
                        ? isDark
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'bg-emerald-600 text-white font-bold'
                        : isDark
                        ? 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {/* Manual Y Range Input Fields */}
              {viewport.yScaleMode === 'manual' && (
                <div className="flex items-center space-x-1.5 ml-2">
                  <input
                    type="number"
                    value={manualMinInput}
                    onChange={(e) => setManualMinInput(e.target.value)}
                    placeholder="Min"
                    className={`w-16 px-1.5 py-0.5 text-xs rounded border font-mono ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-black'
                    }`}
                  />
                  <span>-</span>
                  <input
                    type="number"
                    value={manualMaxInput}
                    onChange={(e) => setManualMaxInput(e.target.value)}
                    placeholder="Max"
                    className={`w-16 px-1.5 py-0.5 text-xs rounded border font-mono ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-black'
                    }`}
                  />
                  <button
                    onClick={handleApplyManualY}
                    className="px-2 py-0.5 bg-emerald-600 text-white text-[11px] font-bold rounded hover:bg-emerald-500"
                  >
                    Set
                  </button>
                </div>
              )}
            </div>

            {/* Interactive Desktop / Tablet Pan & Zoom Controls */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => handlePan('left')}
                className={`p-1 rounded border hover:bg-slate-800 text-slate-300 ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
                }`}
                title="Pan Time Left (Earlier)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handlePan('right')}
                className={`p-1 rounded border hover:bg-slate-800 text-slate-300 ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
                }`}
                title="Pan Time Right (Later)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleZoom('in')}
                className={`p-1 rounded border hover:bg-slate-800 text-slate-300 ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
                }`}
                title="Zoom Time In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleZoom('out')}
                className={`p-1 rounded border hover:bg-slate-800 text-slate-300 ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'
                }`}
                title="Zoom Time Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Validation Error Alert */}
          {manualError && (
            <div className="text-[11px] text-rose-400 font-mono font-bold flex items-center gap-1 pt-1">
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>{manualError}</span>
            </div>
          )}
        </div>

        {/* Target Outside Edge Indicator Badge */}
        {yAxisResult.isTargetOutside && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs">
            <span className="flex items-center gap-1.5 font-semibold">
              {yAxisResult.targetIndicatorDirection === 'above' ? (
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-amber-400" />
              )}
              <span>
                Target {yAxisResult.targetIndicatorDirection === 'above' ? '↑' : '↓'} {targetKbps} Kbps is outside current Y viewport
              </span>
            </span>
            <button
              onClick={() => handleYScaleModeChange('target')}
              className="px-2 py-0.5 bg-amber-500 text-slate-950 font-bold rounded text-[10px] hover:bg-amber-400"
            >
              Show Target Scale
            </button>
          </div>
        )}

        {/* Chart Canvas */}
        <ChartErrorBoundary fallbackMessage="Failed to render bitrate chart canvas.">
          {renderChartCanvas('h-64')}
        </ChartErrorBoundary>

        {/* Chart Footer Summary & Legend */}
        <div className={`flex flex-wrap items-center justify-between text-xs border-t pt-3 gap-2 ${
          isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
        }`}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
              Target Bitrate: <strong className="font-mono">{targetKbps} Kbps</strong>
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
                  <span className="text-amber-500 font-semibold">Instant Raw (Byte Delta)</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={show60sAverage}
                    onChange={(e) => setShow60sAverage(e.target.checked)}
                    className="rounded text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-blue-500 font-semibold">60s Moving Avg</span>
                </label>
              </div>
            )}
          </div>

          <span className="font-mono text-[11px] opacity-75">
            Showing {aggregatedBuckets.length} buckets ({safeHistory.length} raw samples)
          </span>
        </div>
      </div>

      {/* Expanded Modal */}
      {isExpanded && (
        <div
          ref={backdropRef}
          onClick={(e) => e.target === backdropRef.current && setIsExpanded(false)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div className={`w-full max-w-5xl rounded-2xl border p-6 shadow-2xl space-y-4 my-auto relative ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-4 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold font-mono tracking-tight">
                    Expanded Stream Telemetry Viewport
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Inspecting {aggregatedBuckets.length} aggregated time buckets from {safeHistory.length} total samples
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setIsExpanded(false)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${
                    isDark
                      ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  <X className="w-4 h-4 text-rose-500" />
                  <span>Close (Esc)</span>
                </button>
              </div>
            </div>

            <ChartErrorBoundary fallbackMessage="Unable to display expanded telemetry chart.">
              {renderChartCanvas('h-[450px]')}
            </ChartErrorBoundary>
          </div>
        </div>
      )}
    </>
  );
};
