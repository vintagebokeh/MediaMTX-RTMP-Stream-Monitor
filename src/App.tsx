import React, { useEffect, useState, useRef } from 'react';
import { DevRoleSwitcher } from './components/DevRoleSwitcher';
import { TelemetryDebugBadge } from './components/TelemetryDebugBadge';
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
import { logTelemetryHeartbeat, TelemetrySource } from './services/api/telemetryDebug';

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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

  // Telemetry Health Tracking
  const [lastTelemetryReceivedAt, setLastTelemetryReceivedAt] = useState<number | null>(null);
  const [telemetrySource, setTelemetrySource] = useState<TelemetrySource>('unknown');
  const [consecutiveFailures, setConsecutiveFailures] = useState<number>(0);
  const [nowTime, setNowTime] = useState<number>(Date.now());

  useEffect(() => {
    const ticker = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const lastUpdateAgeMs = lastTelemetryReceivedAt ? nowTime - lastTelemetryReceivedAt : null;
  const healthStatus: 'healthy' | 'degraded' | 'stale' =
    lastUpdateAgeMs === null || lastUpdateAgeMs > 10000
      ? 'stale'
      : lastUpdateAgeMs > 3000
      ? 'degraded'
      : 'healthy';

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
    console.log('[Adapter Lifecycle] Creating adapter instance for config:', config);
    const newAdapter = createApiAdapter(config);
    setAdapter(newAdapter);

    return () => {
      console.log('[Adapter Lifecycle] Cleaning up / disposing adapter instance');
      newAdapter.dispose();
    };
  }, [config]);

  // Fetch initial data & subscribe to real-time telemetry
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    console.log('[Pipeline Init] Setting up telemetry subscription for adapter and path:', selectedPathName);

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

        if (!isMounted) return;

        console.log('[API response received] Initial dashboard payload received');
        console.log('[React state updated] Setting initial health, paths, host metrics, and logs');
        setHealth(h);
        setRuntimeConfig(rc);
        setPaths(p);
        setHostMetrics(hm);
        setLogs(l);
        setLatestLatencySample(ls);
      } catch (err) {
        console.warn('Init fetch error:', err);
      }

      if (!isMounted) return;

      unsubscribe = adapter.subscribeLiveMetrics((snapshot: TelemetrySnapshot) => {
        if (!isMounted) return;

        const recvTime = Date.now();
        const src: TelemetrySource = config.useMockData
          ? 'mock'
          : adapter.getConfig().wsUrl
          ? 'websocket'
          : 'http-polling';

        setLastTelemetryReceivedAt(recvTime);
        setTelemetrySource(src);
        setConsecutiveFailures(0);

        setPaths(snapshot.paths);
        setHostMetrics(snapshot.host);

        const targetPath = snapshot.paths.find((item) => item.name === selectedPathName) || snapshot.paths[0];

        let currentSampleCount = 0;
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
            const capped = next.slice(-120);
            currentSampleCount = capped.length;
            return capped;
          });
        }

        logTelemetryHeartbeat({
          source: src,
          pollAt: new Date(snapshot.timestamp).toISOString(),
          receivedAt: new Date(recvTime).toISOString(),
          stateUpdatedAt: new Date().toISOString(),
          pathCount: snapshot.paths.length,
          sampleCount: currentSampleCount || 1,
          adapterInstanceId: adapter.instanceId
        });
      });
    };

    initData();

    return () => {
      console.log('[Pipeline Cleanup] Unsubscribing live metrics');
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
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
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        setIsRefreshing(false);
        refreshTimerRef.current = null;
      }, 400);
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

      <TelemetryDebugBadge
        healthStatus={healthStatus}
        source={telemetrySource}
        lastUpdateAgeMs={lastUpdateAgeMs}
        adapterInstanceId={adapter.instanceId}
        subscriberCount={adapter.getSubscriberCount ? adapter.getSubscriberCount() : 0}
      />
    </div>
  );
}
