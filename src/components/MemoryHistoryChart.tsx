import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';
import { MemorySample } from '../types/memory';
import { getMemoryMonitorService } from '../services/memory/MemoryMonitorService';
import { ChartErrorBoundary } from './ChartErrorBoundary';

interface MemoryHistoryChartProps {
  theme?: 'light' | 'dark';
}

type TimeRange = '5m' | '15m' | '1h';
type ViewMode = 'all' | 'browser-heap' | 'host-ram';

export const MemoryHistoryChart: React.FC<MemoryHistoryChartProps> = ({
  theme = 'dark'
}) => {
  const isDark = theme === 'dark';
  const [timeRange, setTimeRange] = useState<TimeRange>('15m');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [samples, setSamples] = useState<MemorySample[]>(() =>
    getMemoryMonitorService().getSamples()
  );

  useEffect(() => {
    const memoryService = getMemoryMonitorService();
    setSamples(memoryService.getSamples());

    const unsubscribe = memoryService.subscribe(() => {
      setSamples(memoryService.getSamples());
    });

    return unsubscribe;
  }, []);

  const getFilteredSamples = (): MemorySample[] => {
    const maxCount = timeRange === '5m' ? 30 : timeRange === '15m' ? 90 : 360;
    return samples.slice(-maxCount);
  };

  const chartData = getFilteredSamples().map((s) => {
    const date = new Date(s.sampledAt);
    const timeStr = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const hostAvailableGB =
      s.hostAvailableBytes !== null ? +(s.hostAvailableBytes / (1024 * 1024 * 1024)).toFixed(2) : null;
    const hostUsedGB =
      s.hostUsedBytes !== null ? +(s.hostUsedBytes / (1024 * 1024 * 1024)).toFixed(2) : null;
    
    // Convert heap to MB for high precision in browser heap view
    const browserHeapUsedMB =
      s.browserHeapUsedBytes !== null ? +(s.browserHeapUsedBytes / (1024 * 1024)).toFixed(1) : null;
    const browserHeapTotalMB =
      s.browserHeapTotalBytes !== null ? +(s.browserHeapTotalBytes / (1024 * 1024)).toFixed(1) : null;
    const browserHeapLimitMB =
      s.browserHeapLimitBytes !== null ? +(s.browserHeapLimitBytes / (1024 * 1024)).toFixed(1) : null;

    const browserHeapUsedGB =
      s.browserHeapUsedBytes !== null ? +(s.browserHeapUsedBytes / (1024 * 1024 * 1024)).toFixed(3) : null;

    return {
      time: timeStr,
      hostAvailableGB,
      hostUsedGB,
      browserHeapUsedGB,
      browserHeapUsedMB,
      browserHeapTotalMB,
      browserHeapLimitMB
    };
  });

  const latest = samples[samples.length - 1];
  const totalRAMGB = latest?.hostAvailableBytes && latest?.hostUsedBytes
    ? (latest.hostAvailableBytes + latest.hostUsedBytes) / (1024 * 1024 * 1024)
    : 32;
  const criticalThresholdGB = +(totalRAMGB * 0.10).toFixed(2);

  return (
    <div
      id="memory-history-chart"
      className={`rounded-xl border p-5 transition-all shadow-sm space-y-4 ${
        isDark
          ? 'bg-slate-900/80 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-sm tracking-tight">Memory Pressure & JS Heap History</h4>
          <p className="text-xs text-slate-400">Continuous telemetry charts (No animation delay for speed)</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-700/40 bg-slate-950/40 text-xs">
            <button
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                viewMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Combined View
            </button>
            <button
              onClick={() => setViewMode('browser-heap')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                viewMode === 'browser-heap'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Browser Heap (MB)
            </button>
            <button
              onClick={() => setViewMode('host-ram')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                viewMode === 'host-ram'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Host RAM (GB)
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-700/40 bg-slate-950/40 text-xs">
            {(['5m', '15m', '1h'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range === '5m' ? '5 Min' : range === '15m' ? '15 Min' : '1 Hour'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ChartErrorBoundary>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorHostAvail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorHostUsed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBrowserHeap" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorBrowserTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} />
              <XAxis dataKey="time" stroke={isDark ? '#64748b' : '#94a3b8'} fontSize={11} />
              <YAxis
                stroke={isDark ? '#64748b' : '#94a3b8'}
                fontSize={11}
                unit={viewMode === 'browser-heap' ? ' MB' : ' GB'}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  borderColor: isDark ? '#334155' : '#cbd5e1',
                  borderRadius: '0.5rem',
                  fontSize: '12px'
                }}
              />

              {viewMode !== 'browser-heap' && (
                <ReferenceLine
                  y={criticalThresholdGB}
                  label={{
                    value: `Host Critical (${criticalThresholdGB} GB)`,
                    fill: '#f43f5e',
                    fontSize: 10,
                    position: 'insideTopRight'
                  }}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                />
              )}

              {/* View Mode: All or Host RAM */}
              {(viewMode === 'all' || viewMode === 'host-ram') && (
                <>
                  <Area
                    type="monotone"
                    dataKey="hostAvailableGB"
                    name="Host Available RAM (GB)"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorHostAvail)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="hostUsedGB"
                    name="Host Used RAM (GB)"
                    stroke="#6366f1"
                    fillOpacity={1}
                    fill="url(#colorHostUsed)"
                    isAnimationActive={false}
                  />
                </>
              )}

              {/* View Mode: Combined / Browser Heap */}
              {viewMode === 'all' && (
                <Area
                  type="monotone"
                  dataKey="browserHeapUsedGB"
                  name="Browser Heap (GB)"
                  stroke="#f59e0b"
                  fillOpacity={1}
                  fill="url(#colorBrowserHeap)"
                  isAnimationActive={false}
                />
              )}

              {viewMode === 'browser-heap' && (
                <>
                  <Area
                    type="monotone"
                    dataKey="browserHeapLimitMB"
                    name="Heap Limit (MB)"
                    stroke="#f43f5e"
                    strokeDasharray="3 3"
                    fillOpacity={0}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="browserHeapTotalMB"
                    name="Total Heap (MB)"
                    stroke="#38bdf8"
                    fillOpacity={1}
                    fill="url(#colorBrowserTotal)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="browserHeapUsedMB"
                    name="Used Heap (MB)"
                    stroke="#f59e0b"
                    fillOpacity={1}
                    fill="url(#colorBrowserHeap)"
                    isAnimationActive={false}
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartErrorBoundary>
    </div>
  );
};
