import React, { useState } from 'react';
import { FlaskConical, Play, Square, Plus, Activity, CheckCircle2, AlertCircle } from 'lucide-react';
import { Experiment } from '../types';

interface ExperimentsPanelProps {
  experiments: Experiment[];
  onStartExperiment: (id: string) => Promise<void>;
  onStopExperiment: (id: string) => Promise<void>;
  onAddSample: (id: string, latencyMs: number) => Promise<void>;
  theme: 'light' | 'dark';
}

export const ExperimentsPanel: React.FC<ExperimentsPanelProps> = ({
  experiments,
  onStartExperiment,
  onStopExperiment,
  onAddSample,
  theme
}) => {
  const [customSample, setCustomSample] = useState<Record<string, string>>({});
  const isDark = theme === 'dark';

  const handleAddSample = async (id: string) => {
    const val = parseFloat(customSample[id]);
    if (!isNaN(val) && val > 0) {
      await onAddSample(id, val);
      setCustomSample((prev) => ({ ...prev, [id]: '' }));
    }
  };

  return (
    <div
      className={`border rounded-xl p-4 shadow-sm space-y-4 font-sans ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b ${
        isDark ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-indigo-500" />
            <span>Latency Benchmarking & Buffer Experiments</span>
          </h3>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Active MonitoringApi experiment runner and live latency sample recorder
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {experiments.map((exp) => {
          const isRunning = exp.status === 'running';
          return (
            <div
              key={exp.id}
              className={`border rounded-lg p-3 space-y-3 ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold">{exp.name}</span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                        isRunning
                          ? isDark
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isDark
                          ? 'bg-slate-800 text-slate-400 border-slate-700'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}
                    >
                      {exp.status}
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    ID: {exp.id} • Target: {exp.targetLatencyMs}ms
                  </span>
                </div>

                {isRunning ? (
                  <button
                    onClick={() => onStopExperiment(exp.id)}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Square className="w-3 h-3" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onStartExperiment(exp.id)}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1 transition shadow-sm"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Start</span>
                  </button>
                )}
              </div>

              {/* Experiment metrics preview */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className={`p-2 rounded border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <span className={`text-[10px] uppercase block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Average Latency
                  </span>
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {exp.averageLatencyMs} ms
                  </span>
                </div>

                <div className={`p-2 rounded border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <span className={`text-[10px] uppercase block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Sample Count
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {exp.latencySamples.length} samples
                  </span>
                </div>
              </div>

              {/* Samples Sparkline pills */}
              <div className="space-y-1">
                <span className={`text-[10px] uppercase font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Recent Samples (ms)
                </span>
                <div className="flex flex-wrap gap-1">
                  {exp.latencySamples.slice(-8).map((sample, idx) => (
                    <span
                      key={idx}
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                        isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {sample}ms
                    </span>
                  ))}
                </div>
              </div>

              {/* Add Custom Latency Sample */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  placeholder="Latency (ms) e.g. 1990"
                  value={customSample[exp.id] || ''}
                  onChange={(e) =>
                    setCustomSample({ ...customSample, [exp.id]: e.target.value })
                  }
                  className={`flex-1 px-2.5 py-1 text-xs font-mono rounded border focus:outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-100 focus:border-indigo-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                />
                <button
                  onClick={() => handleAddSample(exp.id)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold transition flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Sample</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
