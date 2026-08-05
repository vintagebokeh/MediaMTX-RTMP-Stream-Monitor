import React from 'react';
import { Cpu, HardDrive, Server, Wifi, Activity, ShieldCheck } from 'lucide-react';
import { HostMetrics } from '../types';

interface HostMetricsPanelProps {
  metrics: HostMetrics | null;
  theme?: 'light' | 'dark';
}

export const HostMetricsPanel: React.FC<HostMetricsPanelProps> = ({ metrics, theme = 'light' }) => {
  const isDark = theme === 'dark';

  if (!metrics) {
    return (
      <div className={`border rounded-xl p-6 text-center text-xs font-mono ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-slate-200 text-slate-500'
      }`}>
        Loading host OS metrics...
      </div>
    );
  }

  const {
    cpuPercent,
    memoryUsedMB,
    memoryTotalMB,
    diskPercent,
    networkInKbps,
    networkOutKbps,
    uptimeSec,
    mediamtxProcessCpu,
    mediamtxProcessRamMB
  } = metrics;

  const ramUsedGB = (memoryUsedMB / 1024).toFixed(1);
  const ramTotalGB = (memoryTotalMB / 1024).toFixed(1);
  const ramPercent = +((memoryUsedMB / memoryTotalMB) * 100).toFixed(1);

  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / 86400);
    const hrs = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${days}d ${hrs}h ${mins}m`;
  };

  return (
    <div
      className={`border rounded-xl p-5 shadow-sm space-y-4 font-sans ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 ${
        isDark ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 font-mono">
            <Server className="w-4 h-4 text-indigo-500" />
            <span>Host Operating System & Daemon Telemetry</span>
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Resource usage for host Linux container and private MediaMTX process
          </p>
        </div>

        <div className={`flex items-center space-x-2 text-xs border px-2.5 py-1 rounded-lg font-mono ${
          isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
        }`}>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Uptime: {formatUptime(uptimeSec)}</span>
        </div>
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
        
        {/* CPU */}
        <div className={`border rounded-lg p-3 space-y-1.5 ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className="flex items-center gap-1 font-semibold">
              <Cpu className="w-3.5 h-3.5 text-sky-500" />
              Host CPU
            </span>
            <span className="font-bold text-sky-600 dark:text-sky-300">{cpuPercent}%</span>
          </div>
          <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
            <div
              className="bg-sky-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, cpuPercent)}%` }}
            />
          </div>
          <span className={`text-[10px] block pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            MediaMTX CPU: <strong className="font-bold">{mediamtxProcessCpu}%</strong>
          </span>
        </div>

        {/* RAM */}
        <div className={`border rounded-lg p-3 space-y-1.5 ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className="flex items-center gap-1 font-semibold">
              <Activity className="w-3.5 h-3.5 text-purple-500" />
              Memory (RAM)
            </span>
            <span className="font-bold text-purple-600 dark:text-purple-300">{ramUsedGB}/{ramTotalGB} GB</span>
          </div>
          <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
            <div
              className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${ramPercent}%` }}
            />
          </div>
          <span className={`text-[10px] block pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            MediaMTX RAM: <strong className="font-bold">{mediamtxProcessRamMB} MB</strong>
          </span>
        </div>

        {/* Disk */}
        <div className={`border rounded-lg p-3 space-y-1.5 ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className="flex items-center gap-1 font-semibold">
              <HardDrive className="w-3.5 h-3.5 text-amber-500" />
              Disk Storage
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-300">{diskPercent}%</span>
          </div>
          <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${diskPercent}%` }}
            />
          </div>
          <span className={`text-[10px] block pt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Scratch & HLS storage
          </span>
        </div>

        {/* Network Throughput */}
        <div className={`border rounded-lg p-3 space-y-1.5 ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className="flex items-center gap-1 font-semibold">
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              Network Bandwidth
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold pt-0.5">
            <span className="text-emerald-600 dark:text-emerald-400">In: {(networkInKbps / 1000).toFixed(2)} Mbps</span>
            <span className="text-indigo-600 dark:text-indigo-300">Out: {(networkOutKbps / 1000).toFixed(2)} Mbps</span>
          </div>
          <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Total NIC throughput
          </span>
        </div>

      </div>

    </div>
  );
};

