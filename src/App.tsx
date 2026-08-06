import React, { useEffect, useState } from 'react';
import { DevRoleSwitcher } from './components/DevRoleSwitcher';
import { OpsDashboard } from './views/OpsDashboard';
import { ProducerDashboard } from './views/ProducerDashboard';
import { ClientDashboard } from './views/ClientDashboard';

import {
  BackendHealth,
  ConnectionConfig,
  DashboardPersona,
  HostMetrics,
  LatencyMeasurement,
  LogEntry,
  RuntimeConfig,
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
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [paths, setPaths] = useState<StreamPath[]>([]);
  const [selectedPathName, setSelectedPathName] = useState<string>('live/test');
  const [hostMetrics, setHostMetrics] = useState<HostMetrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [latestLatencySample, setLatestLatencySample] = useState<LatencyMeasurement | null>(null);

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Routing / Persona state derived from URL
  const getPersonaFromPath = (): DashboardPersona => {
    if (typeof window === 'undefined') return 'operator';
    const path = window.location.pathname.toLowerCase();
    if (path.includes('producer')) return 'producer';
    if (path.includes('client')) return 'client';
    return 'operator';
  };

  const [currentPersona, setCurrentPersona] = useState<DashboardPersona>(getPersonaFromPath);

  // Sync state with browser location/history
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPersona(getPersonaFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectPersona = (persona: DashboardPersona) => {
    setCurrentPersona(persona);
    const targetRoute = persona === 'operator' ? '/ops' : `/${persona}`;
    if (window.location.pathname !== targetRoute) {
      window.history.pushState({}, '', targetRoute);
    }
  };

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
        const [h, rc, p, hm, l, ls] = await Promise.all([
          adapter.getHealth(),
          adapter.getRuntimeConfig().catch(() => null),
          adapter.getPaths(),
          adapter.getHostMetrics(),
          adapter.getLogs(),
          adapter.getLatestLatencySample(selectedPathName)
        ]);

        setHealth(h);
        setRuntimeConfig(rc);
        setPaths(p);
        setHostMetrics(hm);
        setLogs(l);
        setLatestLatencySample(ls);
      } catch (err) {
        console.warn('Init fetch error:', err);
      }

      unsubscribe = adapter.subscribeLiveMetrics((snapshot: TelemetrySnapshot) => {
        setPaths(snapshot.paths);
        setHostMetrics(snapshot.host);

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
      const [h, rc, p, hm, l, ls] = await Promise.all([
        adapter.getHealth(),
        adapter.getRuntimeConfig().catch(() => null),
        adapter.getPaths(),
        adapter.getHostMetrics(),
        adapter.getLogs(),
        adapter.getLatestLatencySample(selectedPathName)
      ]);
      setHealth(h);
      setRuntimeConfig(rc);
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

  const handleSaveConfig = (newConfig: ConnectionConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const handleCreatePath = async (name: string) => {
    await adapter.createPathConfig(name);
    const p = await adapter.getPaths();
    setPaths(p);
    setSelectedPathName(name);
    const l = await adapter.getLogs();
    setLogs(l);
  };

  const handleDeletePath = async (name: string) => {
    await adapter.deletePathConfig(name);
    const p = await adapter.getPaths();
    setPaths(p);
    setSelectedPathName('live/test');
    const l = await adapter.getLogs();
    setLogs(l);
  };

  const handleKickPublisher = async (pathName: string) => {
    await adapter.kickPublisher(pathName);
    handleRefresh();
  };

  const handleKickReader = async (pathName: string, readerId: string) => {
    await adapter.kickReader(pathName, readerId);
    handleRefresh();
  };

  return (
    <div className={`min-h-screen font-sans selection:bg-indigo-500 selection:text-white ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Dev Mode Persona Switcher Header */}
      <DevRoleSwitcher
        currentPersona={currentPersona}
        onSelectPersona={handleSelectPersona}
        theme={theme}
      />

      {/* Render selected view */}
      {currentPersona === 'operator' && (
        <OpsDashboard
          health={health}
          config={config}
          paths={paths}
          selectedPathName={selectedPathName}
          setSelectedPathName={setSelectedPathName}
          hostMetrics={hostMetrics}
          logs={logs}
          latestLatencySample={latestLatencySample}
          history={history}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          adapter={adapter}
          theme={theme}
          setTheme={setTheme}
          onRecordLatencySample={handleRecordLatencySample}
          onDeletePath={handleDeletePath}
          onCreatePath={handleCreatePath}
          onKickPublisher={handleKickPublisher}
          onKickReader={handleKickReader}
          onSaveConfig={handleSaveConfig}
        />
      )}

      {currentPersona === 'producer' && (
        <ProducerDashboard
          paths={paths}
          health={health}
          config={runtimeConfig}
          selectedPathName={selectedPathName}
          onSelectPath={setSelectedPathName}
          adapter={adapter}
          theme={theme}
          setTheme={setTheme}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      )}

      {currentPersona === 'client' && (
        <ClientDashboard
          paths={paths}
          health={health}
          config={runtimeConfig}
          theme={theme}
          setTheme={setTheme}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  );
}
