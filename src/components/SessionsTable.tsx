import React from 'react';
import { Users, Radio, UserX, Shield, ArrowUpRight, ArrowDownLeft, HardDrive } from 'lucide-react';
import { PublisherInfo, ReaderInfo } from '../types';

interface SessionsTableProps {
  pathName: string;
  publisher: PublisherInfo | null;
  readers: ReaderInfo[];
  onKickPublisher: (pathName: string) => void;
  onKickReader: (pathName: string, readerId: string) => void;
  theme?: 'light' | 'dark';
}

export const SessionsTable: React.FC<SessionsTableProps> = ({
  pathName,
  publisher,
  readers,
  onKickPublisher,
  onKickReader,
  theme = 'light'
}) => {
  const isDark = theme === 'dark';

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 font-sans">
      
      {/* 1. Active Publisher Section */}
      <div
        className={`border rounded-xl p-4 shadow-sm space-y-3 ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className={`flex items-center justify-between border-b pb-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 font-mono">
                <span>Active Inbound Publisher</span>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-mono font-bold ${
                  isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  1 Active
                </span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Path: <span className="font-mono font-semibold">{pathName}</span>
              </p>
            </div>
          </div>
        </div>

        {publisher ? (
          <div className={`border rounded-lg p-3 space-y-3 font-mono ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <div>
                <span className={`text-[10px] uppercase block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Remote Address
                </span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300">
                  {publisher.remoteAddr}
                </span>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                {publisher.type} ({publisher.state})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Video</span>
                <span className="font-semibold">
                  {publisher.videoCodec} {publisher.videoResolution}
                </span>
              </div>
              <div>
                <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>FPS</span>
                <span className="font-semibold">
                  {publisher.videoFps} FPS
                </span>
              </div>
              <div>
                <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Audio</span>
                <span className="font-semibold">
                  {publisher.audioCodec} {publisher.audioSampleRate / 1000}kHz
                </span>
              </div>
              <div>
                <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Target</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {(publisher.targetBitrateKbps / 1000).toFixed(2)} Mbps
                </span>
              </div>
              <div>
                <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {(publisher.currentBitrateKbps / 1000).toFixed(2)} Mbps
                </span>
              </div>
              <div>
                <span className={`block text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Received</span>
                <span className="font-semibold">
                  {formatBytes(publisher.bytesReceived)}
                </span>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                onClick={() => onKickPublisher(pathName)}
                className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded text-xs font-semibold transition flex items-center gap-1"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        ) : (
          <div className={`p-6 text-center rounded-lg border border-dashed text-xs ${
            isDark ? 'bg-slate-950/50 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-500'
          }`}>
            No active publisher streaming to this path
          </div>
        )}
      </div>

      {/* 2. Active Readers / Viewers Section */}
      <div
        className={`border rounded-xl p-4 shadow-sm space-y-3 ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className={`flex items-center justify-between border-b pb-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-sm">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 font-mono">
                <span>Active Outbound Readers</span>
                <span className={`px-2 py-0.5 text-[10px] rounded-full font-mono font-bold ${
                  isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {readers.length} Connected
                </span>
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Egress subscribers</p>
            </div>
          </div>
        </div>

        {readers.length > 0 ? (
          <div className="space-y-2">
            {readers.map((rd) => (
              <div
                key={rd.id}
                className={`border rounded-lg p-3 flex items-center justify-between gap-2 text-xs font-mono ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold">{rd.remoteAddr}</span>
                    <span className={`px-1.5 py-0.2 text-[10px] rounded border ${
                      isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                    }`}>
                      {rd.protocol}
                    </span>
                  </div>
                  <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    ID: {rd.id} • Sent: {formatBytes(rd.bytesSent)}
                  </div>
                </div>

                <button
                  onClick={() => onKickReader(pathName, rd.id)}
                  className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded text-xs font-semibold transition flex items-center gap-1"
                >
                  <UserX className="w-3 h-3" />
                  <span>Kick</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={`p-6 text-center rounded-lg border border-dashed text-xs ${
            isDark ? 'bg-slate-950/50 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-500'
          }`}>
            No active subscribers reading from this stream
          </div>
        )}
      </div>

    </div>
  );
};

