import React, { useState } from 'react';
import { Header } from '../components/Header';
import { StreamPathCard } from '../components/StreamPathCard';
import { LiveStreamInspector } from '../components/LiveStreamInspector';
import { BitrateChart } from '../components/BitrateChart';
import { SessionsTable } from '../components/SessionsTable';
import { HostMetricsPanel } from '../components/HostMetricsPanel';
import { ExperimentsPanel } from '../components/ExperimentsPanel';
import { LogsViewer } from '../components/LogsViewer';

import { EnvConfigModal } from '../components/EnvConfigModal';
import { PathManagerModal } from '../components/PathManagerModal';
import { MemoryHealthCard } from '../components/MemoryHealthCard';
import { MemoryHistoryChart } from '../components/MemoryHistoryChart';
import { MemoryWarningBanner } from '../components/MemoryWarningBanner';
import { EmergencyActionsModal } from '../components/EmergencyActionsModal';

import {
  BackendHealth,
  ConnectionConfig,
  HostMetrics,
  LatencyMeasurement,
  LogEntry,
  StreamPath
} from '../types';
import { IMonitorApiAdapter } from '../services/api/IMonitorApiAdapter';

interface OpsDashboardProps {
  health: BackendHealth | null;
  config: ConnectionConfig;
  paths: StreamPath[];
  selectedPathName: string;
  setSelectedPathName: (name: string) => void;
  hostMetrics: HostMetrics | null;
  logs: LogEntry[];
  latestLatencySample: LatencyMeasurement | null;
  history: Array<{
    time: string;
    bitrateKbps: number;
    targetKbps: number;
    latencyMs: number;
    inboundErrors: number;
    discardedFrames: number;
  }>;
  isRefreshing: boolean;
  onRefresh: () => void;
  adapter: IMonitorApiAdapter;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  onRecordLatencySample: (streamPath: string, ms: number) => Promise<void>;
  onDeletePath: (name: string) => Promise<void>;
  onCreatePath: (name: string) => Promise<void>;
  onKickPublisher: (pathName: string) => Promise<void>;
  onKickReader: (pathName: string, readerId: string) => Promise<void>;
  onSaveConfig: (newConfig: ConnectionConfig) => void;
}

export const OpsDashboard: React.FC<OpsDashboardProps> = ({
  health,
  config,
  paths,
  selectedPathName,
  setSelectedPathName,
  hostMetrics,
  logs,
  latestLatencySample,
  history,
  isRefreshing,
  onRefresh,
  adapter,
  theme,
  setTheme,
  onRecordLatencySample,
  onDeletePath,
  onCreatePath,
  onKickPublisher,
  onKickReader,
  onSaveConfig
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'telemetry' | 'experiments' | 'host' | 'logs'>('overview');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isNewPathOpen, setIsNewPathOpen] = useState<boolean>(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState<boolean>(false);
  const [experiments, setExperiments] = useState<any[]>([]);

  const loadExperiments = async () => {
    try {
      const list = await adapter.getExperiments();
      setExperiments(list);
    } catch (e) {
      console.warn('Load experiments error:', e);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'experiments') {
      loadExperiments();
    }
  }, [activeTab, adapter]);

  const handleStartExperiment = async (id: string) => {
    await adapter.startExperiment(id);
    await loadExperiments();
  };

  const handleStopExperiment = async (id: string) => {
    await adapter.stopExperiment(id);
    await loadExperiments();
  };

  const handleAddExperimentSample = async (id: string, ms: number) => {
    await adapter.addLatencySample(id, ms);
    await loadExperiments();
  };

  const isDark = theme === 'dark';

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
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      />

      {/* Persistent Operator Warning Banner */}
      <MemoryWarningBanner onOpenActions={() => setIsEmergencyModalOpen(true)} />

      {/* Main Body Layout */}
      <main className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8 py-6 space-y-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Memory Health Card */}
            <MemoryHealthCard
              theme={theme}
              onOpenEmergencyActions={() => setIsEmergencyModalOpen(true)}
            />

            <StreamPathCard
              path={currentPath}
              allPaths={paths}
              selectedPathName={selectedPathName}
              onSelectPath={(name) => setSelectedPathName(name)}
              onDeletePath={onDeletePath}
              latestLatencySample={latestLatencySample}
              onRecordLatencySample={onRecordLatencySample}
              theme={theme}
            />

            <LiveStreamInspector path={currentPath} theme={theme} adapter={adapter} />

            <BitrateChart history={history} theme={theme} />

            <SessionsTable
              pathName={currentPath.name}
              publisher={currentPath.publisher}
              readers={currentPath.readers}
              onKickPublisher={onKickPublisher}
              onKickReader={onKickReader}
              theme={theme}
            />
          </div>
        )}

        {/* TAB 2: TELEMETRY & CHARTS */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <MemoryHealthCard
              theme={theme}
              onOpenEmergencyActions={() => setIsEmergencyModalOpen(true)}
            />
            <MemoryHistoryChart theme={theme} />
            <StreamPathCard
              path={currentPath}
              allPaths={paths}
              selectedPathName={selectedPathName}
              onSelectPath={(name) => setSelectedPathName(name)}
              onDeletePath={onDeletePath}
              latestLatencySample={latestLatencySample}
              onRecordLatencySample={onRecordLatencySample}
              theme={theme}
            />
            <BitrateChart history={history} theme={theme} />
          </div>
        )}

        {/* TAB 3: BENCHMARK EXPERIMENTS */}
        {activeTab === 'experiments' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <ExperimentsPanel
              experiments={experiments}
              onStartExperiment={handleStartExperiment}
              onStopExperiment={handleStopExperiment}
              onAddSample={handleAddExperimentSample}
              theme={theme}
            />
          </div>
        )}

        {/* TAB 4: HOST OPERATING SYSTEM METRICS */}
        {activeTab === 'host' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <MemoryHealthCard
              theme={theme}
              onOpenEmergencyActions={() => setIsEmergencyModalOpen(true)}
            />
            <MemoryHistoryChart theme={theme} />
            <HostMetricsPanel metrics={hostMetrics} theme={theme} />
          </div>
        )}

        {/* TAB 5: AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <LogsViewer logs={logs} theme={theme} />
          </div>
        )}
      </main>

      {/* Modals */}
      <EmergencyActionsModal
        isOpen={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
        theme={theme}
      />

      <EnvConfigModal
        isOpen={isSettingsOpen}
        config={config}
        onClose={() => setIsSettingsOpen(false)}
        onSave={onSaveConfig}
        theme={theme}
      />

      <PathManagerModal
        isOpen={isNewPathOpen}
        onClose={() => setIsNewPathOpen(false)}
        onCreatePath={onCreatePath}
        theme={theme}
      />
    </div>
  );
};
