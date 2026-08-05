import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { StreamPathCard } from './components/StreamPathCard';
import { LiveStreamInspector } from './components/LiveStreamInspector';
import { BitrateChart } from './components/BitrateChart';
import { SessionsTable } from './components/SessionsTable';
import { HostMetricsPanel } from './components/HostMetricsPanel';
import { ExperimentsPanel } from './components/ExperimentsPanel';
import { LogsViewer } from './components/LogsViewer';

import { EnvConfigModal } from './components/EnvConfigModal';
import { PathManagerModal } from './components/PathManagerModal';

import {
  BackendHealth,
  ConnectionConfig,
  HostMetrics,
  LatencyMeasurement,
  LogEntry,
  StreamPath,
  TelemetrySnapshot
} from './types';
import { IMonitorApiAdapter } from './services/api/IMonitorApiAdapter';
import { createApiAdapter, getDefaultConfig, saveConfig } from './services/api/adapterFactory';

export default function App() {
  const [config, setConfig] = useState<ConnectionConfig>(getDefaultConfig());
  const [adapter, setAdapter] = useState<IMonitorApiAdapter>(() => createApiAdapter(config));
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [paths, setPaths] = useState<StreamPath[]>([]);
  const [selectedPathName, setSelectedPathName] = useState<string>('live/test');
  const [hostMetrics, setHostMetrics] = useState<HostMetrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [latestLatencySample, setLatestLatencySample] = useState<LatencyMeasurement | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'telemetry' | 'experiments' | 'host' | 'logs'>('overview');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isNewPathOpen, setIsNewPathOpen] = useState<boolean>(false);

  const isDark = theme === 'dark';

  // Telemetry History for Chart
  const [history, setHistory] = useState<
    Array<{
      time: string;
      bitrateKbps: number;
      targetKbps: number;
      latencyMs: number;
      inboundErrors: number;
      discardedFrames: number;
    }>
  >([]);

  // Re-create adapter when config changes
  useEffect(() => {
    const newAdapter = createApiAdapter(config);
    setAdapter(newAdapter);
  }, [config]);

  // Fetch initial data & subscribe to real-time telemetry
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const initData = async () => {
      try {
        const h = await adapter.getHealth();
        setHealth(h);

        const p = await adapter.getPaths();
        setPaths(p);

        const hm = await adapter.getHostMetrics();
        setHostMetrics(hm);

        const l = await adapter.getLogs();
        setLogs(l);

        const ls = await adapter.getLatestLatencySample(selectedPathName);
        setLatestLatencySample(ls);
      } catch (err) {
        console.warn('Init fetch error:', err);
      }

      unsubscribe = adapter.subscribeLiveMetrics((snapshot: TelemetrySnapshot) => {
        setPaths(snapshot.paths);
        setHostMetrics(snapshot.host);

        // Update selected path if needed
        const targetPath = snapshot.paths.find((item) => item.name === selectedPathName) || snapshot.paths[0];
        
        if (targetPath) {
          const timeLabel = new Date(snapshot.timestamp).toLocaleTimeString();
          setHistory((prev) => {
            const next = [
              ...prev,
              {
                time: timeLabel,
                bitrateKbps: targetPath.metrics.currentBitrateKbps,
                targetKbps: targetPath.metrics.targetBitrateKbps,
                latencyMs: targetPath.metrics.latencyMs,
                inboundErrors: targetPath.metrics.inboundErrors,
                discardedFrames: targetPath.metrics.discardedFrames
              }
            ];
            // Keep last 30 data points
            return next.slice(-30);
          });
        }
      });
    };

    initData();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [adapter, selectedPathName]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [h, p, hm, l, ls] = await Promise.all([
        adapter.getHealth(),
        adapter.getPaths(),
        adapter.getHostMetrics(),
        adapter.getLogs(),
        adapter.getLatestLatencySample(selectedPathName)
      ]);
      setHealth(h);
      setPaths(p);
      setHostMetrics(hm);
      setLogs(l);
      setLatestLatencySample(ls);
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleRecordLatencySample = async (streamPath: string, ms: number) => {
    const sample = await adapter.recordLatencySample(streamPath, ms, 'manual');
    setLatestLatencySample(sample);
    const p = await adapter.getPaths();
    setPaths(p);
  };

  // Save new configuration
  const handleSaveConfig = (newConfig: ConnectionConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  // Create new path
  const handleCreatePath = async (name: string) => {
    await adapter.createPathConfig(name);
    const p = await adapter.getPaths();
    setPaths(p);
    setSelectedPathName(name);
    const l = await adapter.getLogs();
    setLogs(l);
  };

  // Delete path
  const handleDeletePath = async (name: string) => {
    await adapter.deletePathConfig(name);
    const p = await adapter.getPaths();
    setPaths(p);
    setSelectedPathName('live/test');
    const l = await adapter.getLogs();
    setLogs(l);
  };

  // Kick publisher
  const handleKickPublisher = async (pathName: string) => {
    await adapter.kickPublisher(pathName);
    handleRefresh();
  };

  // Kick reader
  const handleKickReader = async (pathName: string, readerId: string) => {
    await adapter.kickReader(pathName, readerId);
    handleRefresh();
  };

  const currentPath = paths.find((p) => p.name === selectedPathName) || paths[0] || {
    name: 'live/test',
    ready: true,
    tracks: ['H264', 'AAC'],
    bytesReceived: 2700000000,
    bytesSent: 1350000000,
    publisher: {
      id: 'pub-live-test-01',
      type: 'rtmpConn',
      remoteAddr: '192.168.1.45:58410',
      state: 'publishing',
      videoCodec: 'H.264',
      videoResolution: '1920x1080',
      videoFps: 60,
      audioCodec: 'AAC',
      audioSampleRate: 48000,
      audioChannels: 'stereo',
      targetBitrateKbps: 6000,
      currentBitrateKbps: 6000,
      connectedAt: new Date().toISOString(),
      bytesReceived: 2700000000
    },
    readers: [
      {
        id: 'rd-webrtc-892',
        type: 'webrtcConn',
        remoteAddr: '10.0.0.12:61200',
        protocol: 'WebRTC',
        connectedAt: new Date().toISOString(),
        bytesSent: 1350000000
      }
    ],
    metrics: {
      currentBitrateKbps: 6000,
      targetBitrateKbps: 6000,
      latencyMs: 2000,
      inboundErrors: 0,
      discardedFrames: 0,
      fps: 60,
      jitterMs: 1.5,
      keyframeIntervalSec: 2.0
    }
  };

  return (
    <div className={`min-h-screen font-sans selection:bg-indigo-500 selection:text-white ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      
      {/* Top Navigation Header */}
      <Header
        health={health}
        config={config}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNewPath={() => setIsNewPathOpen(true)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      />

      {/* Main Body Layout */}
      <main className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8 py-6 space-y-6">
        
        {/* TAB 1: OVERVIEW (Hero Card + Live Inspector Player + Sessions) */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Stream Path Status Card */}
            <StreamPathCard
              path={currentPath}
              allPaths={paths}
              selectedPathName={selectedPathName}
              onSelectPath={(name) => setSelectedPathName(name)}
              onDeletePath={handleDeletePath}
              latestLatencySample={latestLatencySample}
              onRecordLatencySample={handleRecordLatencySample}
              theme={theme}
            />

            {/* Visual Stream Inspector Canvas & Audio VU Meter */}
            <LiveStreamInspector path={currentPath} theme={theme} adapter={adapter} />

            {/* Real-time Bitrate Sparkline */}
            <BitrateChart history={history} theme={theme} />

            {/* Active Sessions (Publisher & Readers) */}
            <SessionsTable
              pathName={currentPath.name}
              publisher={currentPath.publisher}
              readers={currentPath.readers}
              onKickPublisher={handleKickPublisher}
              onKickReader={handleKickReader}
              theme={theme}
            />
          </div>
        )}

        {/* TAB 2: TELEMETRY & CHARTS */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <StreamPathCard
              path={currentPath}
              allPaths={paths}
              selectedPathName={selectedPathName}
              onSelectPath={(name) => setSelectedPathName(name)}
              onDeletePath={handleDeletePath}
              latestLatencySample={latestLatencySample}
              onRecordLatencySample={handleRecordLatencySample}
              theme={theme}
            />
            <BitrateChart history={history} theme={theme} />
          </div>
        )}

        {/* TAB 3: BENCHMARK EXPERIMENTS */}
        {activeTab === 'experiments' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <ExperimentsPanel adapter={adapter} theme={theme} />
          </div>
        )}

        {/* TAB 4: HOST OPERATING SYSTEM METRICS */}

        {activeTab === 'host' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <HostMetricsPanel metrics={hostMetrics} theme={theme} />
          </div>
        )}

        {/* TAB 4: AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <LogsViewer logs={logs} theme={theme} />
          </div>
        )}

      </main>

      {/* Modals */}
      <EnvConfigModal
        isOpen={isSettingsOpen}
        config={config}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveConfig}
        theme={theme}
      />

      <PathManagerModal
        isOpen={isNewPathOpen}
        onClose={() => setIsNewPathOpen(false)}
        onCreatePath={handleCreatePath}
        theme={theme}
      />

    </div>
  );
}

