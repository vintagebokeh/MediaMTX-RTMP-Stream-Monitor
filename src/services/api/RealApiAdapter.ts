import {
  BackendHealth,
  ConnectionConfig,
  CurrentMetrics,
  Experiment,
  HostMetrics,
  LatencyMeasurement,
  LogEntry,
  RuntimeConfig,
  StreamInfo,
  StreamPath,
  TelemetrySnapshot
} from '../../types';
import { IMonitorApiAdapter } from './IMonitorApiAdapter';
import { logTelemetryLifecycle } from './telemetryDebug';

export class RealApiAdapter implements IMonitorApiAdapter {
  readonly instanceId: string = 'real_' + Math.random().toString(36).substring(2, 8);
  private config: ConnectionConfig;
  private ws: WebSocket | null = null;
  private subscribers: Set<(data: TelemetrySnapshot) => void> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isDisposed = false;
  private isPollPending = false;
  private activeTransport: 'websocket' | 'http-polling' | 'none' = 'none';
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsReconnectAttempts = 0;
  private readonly maxWsReconnectAttempts = 5;

  constructor(config: ConnectionConfig) {
    this.config = config;
    logTelemetryLifecycle('adapter created', this.instanceId, { mode: 'real', config: this.config });
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  private getBaseUrl(): string {
    // Ensure no trailing slash
    let url = this.config.apiUrl || '';
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  getConfig(): ConnectionConfig {
    return { ...this.config };
  }

  async getRuntimeConfig(): Promise<RuntimeConfig> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/v1/runtime-config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('RealApiAdapter getRuntimeConfig error:', err);
      const host = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
      return {
        environment: this.config.appEnv || 'local',
        streamPath: 'live/test',
        playback: {
          webrtcUrl: `http://${host}:8889/live/test`,
          hlsUrl: `http://${host}:8888/live/test/index.m3u8`
        },
        features: {
          livePreviewEnabled: true
        }
      };
    }
  }

  async getHealth(): Promise<BackendHealth> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('RealApiAdapter getHealth error:', err);
      return {
        status: 'error',
        uptime: 0,
        mediamtxConnected: false,
        activePathsCount: 0,
        totalPublishers: 0,
        totalReaders: 0,
        totalBitrateKbps: 0,
        appEnv: this.config.appEnv,
        mockMode: false
      };
    }
  }

  async getPaths(): Promise<StreamPath[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/paths`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('RealApiAdapter getPaths error:', err);
      return [];
    }
  }

  async getPathDetails(name: string): Promise<StreamPath | null> {
    try {
      const encoded = encodeURIComponent(name);
      const res = await fetch(`${this.getBaseUrl()}/api/paths/${encoded}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async getHostMetrics(): Promise<HostMetrics> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/metrics/host`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        cpuPercent: 0,
        memoryUsedMB: 0,
        memoryTotalMB: 0,
        diskPercent: 0,
        networkInKbps: 0,
        networkOutKbps: 0,
        uptimeSec: 0,
        mediamtxProcessCpu: 0,
        mediamtxProcessRamMB: 0
      };
    }
  }

  async getCurrentMetrics(): Promise<CurrentMetrics> {
    return this.getHostMetrics();
  }

  async getStreams(): Promise<StreamInfo[]> {
    return this.getPaths();
  }

  async getLatestLatencySample(streamPath = 'live/test'): Promise<LatencyMeasurement> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/v1/latency-samples/latest?streamPath=${encodeURIComponent(streamPath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        valueMs: null,
        source: 'manual',
        measuredAt: null,
        confidence: 'medium'
      };
    }
  }

  async recordLatencySample(
    streamPath: string,
    latencyMs: number,
    source: LatencyMeasurement['source'] = 'manual'
  ): Promise<LatencyMeasurement> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/v1/latency-samples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamPath, latencyMs, source })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('RealApiAdapter recordLatencySample error:', err);
      return {
        valueMs: latencyMs,
        source,
        measuredAt: new Date().toISOString(),
        confidence: 'medium'
      };
    }
  }

  async getExperiments(): Promise<Experiment[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/experiments`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      return [];
    }
  }

  async addLatencySample(experimentId: string, latencyMs: number): Promise<void> {
    try {
      await fetch(`${this.getBaseUrl()}/api/experiments/${encodeURIComponent(experimentId)}/samples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latencyMs })
      });
    } catch (err) {
      // ignore
    }
  }

  async startExperiment(experimentId: string): Promise<void> {
    try {
      await fetch(`${this.getBaseUrl()}/api/experiments/${encodeURIComponent(experimentId)}/start`, {
        method: 'POST'
      });
    } catch (err) {
      // ignore
    }
  }

  async stopExperiment(experimentId: string): Promise<void> {
    try {
      await fetch(`${this.getBaseUrl()}/api/experiments/${encodeURIComponent(experimentId)}/stop`, {
        method: 'POST'
      });
    } catch (err) {
      // ignore
    }
  }


  async getLogs(limit: number = 50): Promise<LogEntry[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/logs?limit=${limit}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      return [];
    }
  }

  async kickReader(pathName: string, readerId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/readers/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathName, readerId })
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  async kickPublisher(pathName: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/publishers/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathName })
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  async createPathConfig(pathName: string, configData?: Partial<StreamPath>): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pathName, config: configData })
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  async deletePathConfig(pathName: string): Promise<boolean> {
    try {
      const encoded = encodeURIComponent(pathName);
      const res = await fetch(`${this.getBaseUrl()}/api/paths/${encoded}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }

  subscribeLiveMetrics(callback: (data: TelemetrySnapshot) => void): () => void {
    if (this.isDisposed) return () => {};

    this.subscribers.add(callback);
    logTelemetryLifecycle('subscriber added', this.instanceId, { totalSubscribers: this.subscribers.size });

    if (this.subscribers.size === 1) {
      this.startTransport();
    }

    return () => {
      this.subscribers.delete(callback);
      logTelemetryLifecycle('subscriber removed', this.instanceId, { remainingSubscribers: this.subscribers.size });
      if (this.subscribers.size === 0) {
        this.stopAllTransports('no-subscribers');
      }
    };
  }

  private startTransport() {
    if (this.isDisposed || this.subscribers.size === 0) return;

    if (this.config.wsUrl) {
      this.connectWebSocket();
    } else {
      this.startHttpPolling();
    }
  }

  private connectWebSocket() {
    if (this.isDisposed || this.subscribers.size === 0 || this.ws) return;

    try {
      logTelemetryLifecycle('transport started', this.instanceId, { transport: 'websocket', url: this.config.wsUrl });
      this.activeTransport = 'websocket';
      this.ws = new WebSocket(this.config.wsUrl!);

      this.ws.onopen = () => {
        this.wsReconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        if (this.isDisposed) return;
        try {
          const data = JSON.parse(event.data);
          // If WS message received while HTTP polling fallback was running, stop HTTP polling
          if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            logTelemetryLifecycle('transport fallback', this.instanceId, { from: 'http-polling', to: 'websocket' });
          }
          this.activeTransport = 'websocket';
          this.subscribers.forEach((cb) => cb(data));
        } catch (e) {
          // parse error ignored
        }
      };

      this.ws.onerror = () => {
        if (this.isDisposed) return;
        this.handleWsFailure();
      };

      this.ws.onclose = () => {
        if (this.isDisposed) return;
        this.ws = null;
        this.handleWsFailure();
      };
    } catch (err) {
      if (this.isDisposed) return;
      this.handleWsFailure();
    }
  }

  private handleWsFailure() {
    if (this.isDisposed || this.subscribers.size === 0) return;

    // Start HTTP polling as fallback if not already running
    if (!this.pollInterval) {
      logTelemetryLifecycle('transport fallback', this.instanceId, { from: 'websocket', to: 'http-polling' });
      this.startHttpPolling();
    }

    // Attempt bounded WS reconnect backoff if allowed
    if (this.wsReconnectAttempts < this.maxWsReconnectAttempts && !this.wsReconnectTimer) {
      this.wsReconnectAttempts++;
      const backoffMs = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 10000);
      this.wsReconnectTimer = setTimeout(() => {
        this.wsReconnectTimer = null;
        if (!this.isDisposed && this.subscribers.size > 0 && !this.ws) {
          this.connectWebSocket();
        }
      }, backoffMs);
    }
  }

  private startHttpPolling() {
    if (this.isDisposed || this.pollInterval) return;

    logTelemetryLifecycle('transport started', this.instanceId, { transport: 'http-polling' });
    this.activeTransport = 'http-polling';

    this.pollInterval = setInterval(async () => {
      if (this.isDisposed || this.subscribers.size === 0) return;

      // Single-flight guard against overlapping requests
      if (this.isPollPending) {
        return;
      }

      this.isPollPending = true;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const [paths, host] = await Promise.all([
          this.getPaths(),
          this.getHostMetrics()
        ]);
        clearTimeout(timeoutId);

        if (this.isDisposed || this.subscribers.size === 0) return;

        const snapshot: TelemetrySnapshot = {
          paths,
          host,
          timestamp: Date.now(),
          mediamtxConnected: true
        };
        this.subscribers.forEach((cb) => cb(snapshot));
      } catch (e) {
        clearTimeout(timeoutId);
      } finally {
        this.isPollPending = false;
      }
    }, 1500);
  }

  private stopAllTransports(reason: string) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.activeTransport = 'none';
    this.isPollPending = false;
    logTelemetryLifecycle('transport stopped', this.instanceId, { reason });
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.stopAllTransports('disposed');
    this.subscribers.clear();
    logTelemetryLifecycle('adapter disposed', this.instanceId);
  }
}
