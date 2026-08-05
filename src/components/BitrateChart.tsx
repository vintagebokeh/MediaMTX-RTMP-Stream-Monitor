import React, { useState } from 'react';
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
import { Activity, Clock, AlertOctagon, Zap } from 'lucide-react';

interface ChartPoint {
  time: string;
  bitrateKbps: number;
  targetKbps: number;
  latencyMs: number;
  inboundErrors: number;
  discardedFrames: number;
}

interface BitrateChartProps {
  history: ChartPoint[];
  theme?: 'light' | 'dark';
}

export const BitrateChart: React.FC<BitrateChartProps> = ({ history, theme = 'light' }) => {
  const [metricTab, setMetricTab] = useState<'bitrate' | 'latency' | 'errors'>('bitrate');
  const isDark = theme === 'dark';

  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#cbd5e1';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';

  return (
    <div
      className={`border rounded-xl p-5 shadow-sm space-y-4 font-sans ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      
      {/* Header & Tabs */}
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

        {/* Tab Selection */}
        <div className={`flex items-center space-x-1 p-1 rounded-lg border font-mono text-xs self-start sm:self-auto ${
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
            <span>Latency (~2.0s)</span>
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
      </div>

      {/* Recharts Render Canvas */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {metricTab === 'bitrate' ? (
            <LineChart data={history} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.6} />
              <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickLine={false} />
              <YAxis
                stroke={axisColor}
                fontSize={10}
                tickLine={false}
                domain={[5000, 7000]}
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
                name="Current Bitrate"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : metricTab === 'latency' ? (
            <LineChart data={history} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
              <ReferenceLine y={2000} label={{ value: '2000 ms Target (~2.0s)', fill: '#6366f1', fontSize: 10 }} stroke="#6366f1" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="latencyMs"
                name="Measured Latency"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <LineChart data={history} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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

      {/* Legend & Summary Notes */}
      <div className={`flex flex-wrap items-center justify-between text-xs border-t pt-3 ${
        isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
      }`}>
        <div className="flex items-center space-x-6">
          <span className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
            Target Bitrate: <strong className="font-mono">6000 Kbps (6 Mbps)</strong>
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-indigo-500 rounded-full" />
            Target Latency: <strong className="font-mono">~2000 ms (2.0s)</strong>
          </span>
        </div>

        <span className="font-mono text-[11px] opacity-75">
          Showing last {history.length} samples
        </span>
      </div>

    </div>
  );
};

