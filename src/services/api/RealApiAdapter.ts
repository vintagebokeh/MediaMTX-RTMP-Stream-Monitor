import {
  BackendHealth,
  ConnectionConfig,
  CurrentMetrics,
  Experiment,
  HostMetrics,
  LogEntry,
  StreamInfo,
  StreamPath,
  TelemetrySnapshot
} from '../../types';
import { IMonitorApiAdapter } from './IMonitorApiAdapter';

export class RealApiAdapter implements IMonitorApiAdapter {

  private config: ConnectionConfig;
  private ws: WebSocket | null = null;
  private subscribers: Set<(data: TelemetrySnapshot) => void> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
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
    this.subscribers.add(callback);

    // Try WebSocket connection first if configured
    if (!this.ws && this.config.wsUrl) {
      try {
        this.ws = new WebSocket(this.config.wsUrl);
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.subscribers.forEach((cb) => cb(data));
          } catch (e) {
            console.error('WS parse error:', e);
          }
        };

        this.ws.onerror = (err) => {
          console.warn('WS error, switching to HTTP polling:', err);
          this.startHttpPolling();
        };

        this.ws.onclose = () => {
          this.ws = null;
          this.startHttpPolling();
        };
      } catch (err) {
        this.startHttpPolling();
      }
    } else {
      this.startHttpPolling();
    }

    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0) {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        if (this.pollInterval) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
        }
      }
    };
  }

  private startHttpPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(async () => {
      if (this.subscribers.size === 0) return;
      try {
        const [paths, host] = await Promise.all([
          this.getPaths(),
          this.getHostMetrics()
        ]);
        const snapshot: TelemetrySnapshot = {
          paths,
          host,
          timestamp: Date.now(),
          mediamtxConnected: true
        };
        this.subscribers.forEach((cb) => cb(snapshot));
      } catch (e) {
        // quiet error during polling
      }
    }, 1500);
  }
}
