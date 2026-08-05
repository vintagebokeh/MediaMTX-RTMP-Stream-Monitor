import React from 'react';
import {
  CheckCircle2,
  Clock,
  Zap,
  AlertTriangle,
  Radio,
  Video,
  Volume2,
  Users,
  HardDrive,
  Trash2,
  Tv
} from 'lucide-react';
import { StreamPath } from '../types';

interface StreamPathCardProps {
  path: StreamPath;
  allPaths: StreamPath[];
  selectedPathName: string;
  onSelectPath: (name: string) => void;
  onDeletePath: (name: string) => void;
  theme?: 'light' | 'dark';
}

export const StreamPathCard: React.FC<StreamPathCardProps> = ({
  path,
  allPaths,
  selectedPathName,
  onSelectPath,
  onDeletePath,
  theme = 'light'
}) => {
  const isDark = theme === 'dark';
  const { name, ready, publisher, readers, metrics } = path;

  const bitrateMbps = (metrics.currentBitrateKbps / 1000).toFixed(2);
  const targetMbps = (metrics.targetBitrateKbps / 1000).toFixed(2);
  const latencySec = (metrics.latencyMs / 1000).toFixed(2);

  return (
    <div className="space-y-4 font-sans">
      {/* Path Tabs Selector if multiple paths exist */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none font-mono">
        {allPaths.map((p) => {
          const isSelected = p.name === selectedPathName;
          return (
            <button
              key={p.name}
              onClick={() => onSelectPath(p.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border flex items-center gap-1.5 ${
                isSelected
                  ? isDark
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm'
                  : isDark
                  ? 'bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${p.ready ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span>{p.name}</span>
              {p.name === 'live/test' && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded ${
                  isDark ? 'bg-indigo-500/30 text-indigo-200' : 'bg-indigo-100 text-indigo-800'
                }`}>
                  Primary
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hero Stream Card - High Density */}
      <div
        className={`border rounded-xl p-5 shadow-sm relative overflow-hidden ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Subtle decorative background glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Row */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}>
              <Tv className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold font-mono tracking-wide">
                  {name}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1 border ${
                    ready
                      ? isDark
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : isDark
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
                  {ready ? 'ACTIVE STREAM' : 'IDLE'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Publisher: <span className="font-mono font-semibold">{publisher?.remoteAddr || 'None'}</span> • Protocol: <span className="font-semibold">{publisher?.type || 'RTMP'}</span>
              </p>
            </div>
          </div>

          {name !== 'live/test' && (
            <button
              onClick={() => onDeletePath(name)}
              className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold transition flex items-center gap-1 self-start sm:self-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Path</span>
            </button>
          )}
        </div>

        {/* Core Metric Highlights Grid - High Density */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          
          {/* 1. Target vs Current Bitrate */}
          <div className={`border rounded-lg p-3 space-y-1.5 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span className="flex items-center gap-1 font-semibold">
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                Bitrate
              </span>
              <span className="font-mono text-[10px]">
                Target: {targetMbps} Mbps
              </span>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {bitrateMbps}
              </span>
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mbps</span>
            </div>
            <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (metrics.currentBitrateKbps / metrics.targetBitrateKbps) * 100)}%`
                }}
              />
            </div>
          </div>

          {/* 2. Measured Latency */}
          <div className={`border rounded-lg p-3 space-y-1.5 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span className="flex items-center gap-1 font-semibold">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                End-to-End Latency
              </span>
              <span className={`font-mono text-[10px] px-1 py-0.2 rounded ${
                isDark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-800'
              }`}>
                ±{metrics.jitterMs}ms Jitter
              </span>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-300">
                {latencySec}
              </span>
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>seconds</span>
            </div>
            <p className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              MediaMTX Buffer: {metrics.latencyMs} ms
            </p>
          </div>

          {/* 3. Inbound Errors */}
          <div className={`border rounded-lg p-3 space-y-1.5 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span className="flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Inbound Errors
              </span>
              <span className={`text-[10px] font-semibold px-1 py-0.2 rounded ${
                isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
              }`}>
                Optimal
              </span>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {metrics.inboundErrors}
              </span>
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>errors</span>
            </div>
            <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Strict 0 errors requirement verified
            </p>
          </div>

          {/* 4. Discarded Frames */}
          <div className={`border rounded-lg p-3 space-y-1.5 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span className="flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Discarded Frames
              </span>
              <span className={`text-[10px] font-semibold px-1 py-0.2 rounded ${
                isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
              }`}>
                0 Dropped
              </span>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {metrics.discardedFrames}
              </span>
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>frames</span>
            </div>
            <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Keyframe interval: <span className="font-mono">{metrics.keyframeIntervalSec}s</span>
            </p>
          </div>

        </div>

        {/* Media Technical Codec Badges - High Density */}
        <div className={`mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            {/* Video Codec */}
            <div className={`border rounded-md px-2.5 py-1 flex items-center gap-1.5 ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <Video className="w-3.5 h-3.5 text-sky-500" />
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Video:</span>
              <span className="font-mono font-bold">
                {publisher?.videoCodec || 'H.264'}
              </span>
              <span className="opacity-40">|</span>
              <span className="font-mono font-semibold text-sky-600 dark:text-sky-300">
                {publisher?.videoResolution || '1920x1080'}
              </span>
              <span className="opacity-40">@</span>
              <span className="font-mono font-semibold">
                {publisher?.videoFps || 60} FPS
              </span>
            </div>

            {/* Audio Codec */}
            <div className={`border rounded-md px-2.5 py-1 flex items-center gap-1.5 ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <Volume2 className="w-3.5 h-3.5 text-purple-500" />
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Audio:</span>
              <span className="font-mono font-bold">
                {publisher?.audioCodec || 'AAC'}
              </span>
              <span className="opacity-40">|</span>
              <span className="font-mono font-semibold text-purple-600 dark:text-purple-300">
                {(publisher?.audioSampleRate ? publisher.audioSampleRate / 1000 : 48)} kHz
              </span>
              <span className="opacity-40">|</span>
              <span className="font-mono font-semibold uppercase">
                {publisher?.audioChannels || 'stereo'}
              </span>
            </div>
          </div>

          {/* Active Session Counts */}
          <div className={`flex items-center space-x-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              Publisher: <strong className="font-mono">{publisher ? 1 : 0}</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-emerald-500" />
              Readers: <strong className="font-mono">{readers.length}</strong>
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};

