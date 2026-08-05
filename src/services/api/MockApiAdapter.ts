import {
  BackendHealth,
  ConnectionConfig,
  CurrentMetrics,
  Experiment,
  HostMetrics,
  LogEntry,
  PublisherInfo,
  ReaderInfo,
  StreamInfo,
  StreamPath,
  TelemetrySnapshot
} from '../../types';
import { IMonitorApiAdapter } from './IMonitorApiAdapter';

export class MockApiAdapter implements IMonitorApiAdapter {
  private config: ConnectionConfig;
  private paths: Map<string, StreamPath> = new Map();
  private logs: LogEntry[] = [];
  private host: HostMetrics;
  private subscribers: Set<(data: TelemetrySnapshot) => void> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;
  private uptimeStart: number = Date.now();

  private experiments: Experiment[] = [
    {
      id: 'exp-rtmp-buffer-01',
      name: 'RTMP Ingest Latency & Buffer Optimization',
      status: 'running',
      startedAt: new Date(Date.now() - 600000).toISOString(),
      targetLatencyMs: 2000,
      latencySamples: [1980, 2010, 1995, 2005, 2020, 1985],
      averageLatencyMs: 1999.1
    },
    {
      id: 'exp-webrtc-egress-02',
      name: 'WebRTC Ultra-Low Latency Egress Test',
      status: 'stopped',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      stoppedAt: new Date(Date.now() - 1800000).toISOString(),
      targetLatencyMs: 500,
      latencySamples: [512, 498, 505, 490, 510],
      averageLatencyMs: 503.0
    }
  ];

  constructor(config: ConnectionConfig) {
    this.config = config;
    this.host = {
      cpuPercent: 14.2,
      memoryUsedMB: 1024,
      memoryTotalMB: 8192,
      diskPercent: 28.5,
      networkInKbps: 6040,
      networkOutKbps: 6120,
      uptimeSec: 86400,
      mediamtxProcessCpu: 3.8,
      mediamtxProcessRamMB: 148
    };

    this.initDefaultMockData();
    this.startSimulationLoop();
  }

  private initDefaultMockData() {
    // Exact prompt specification:
    // - one active path: live/test
    // - one publisher
    // - one reader
    // - H.264 1920x1080
    // - AAC 48 kHz stereo
    // - 6 Mbps target bitrate
    // - approximately 2-second latency
    // - zero inbound errors
    // - zero discarded frames

    const publisher: PublisherInfo = {
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
      currentBitrateKbps: 6012,
      connectedAt: new Date(Date.now() - 3600000).toISOString(),
      bytesReceived: 2700000000 // ~2.7 GB
    };

    const reader: ReaderInfo = {
      id: 'rd-webrtc-892',
      type: 'webrtcConn',
      remoteAddr: '10.0.0.12:61200',
      protocol: 'WebRTC',
      connectedAt: new Date(Date.now() - 1800000).toISOString(),
      bytesSent: 1350000000
    };

    const liveTestPath: StreamPath = {
      name: 'live/test',
      ready: true,
      tracks: ['H264', 'AAC'],
      bytesReceived: 2700000000,
      bytesSent: 1350000000,
      publisher,
      readers: [reader],
      metrics: {
        currentBitrateKbps: 6012,
        targetBitrateKbps: 6000,
        latencyMs: 2010, // ~2.0s
        inboundErrors: 0, // strictly 0
        discardedFrames: 0, // strictly 0
        fps: 60,
        jitterMs: 1.8,
        keyframeIntervalSec: 2.0
      }
    };

    this.paths.set('live/test', liveTestPath);

    // Initial Logs
    this.logs = [
      {
        id: 'log-001',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        level: 'info',
        source: 'mediamtx',
        message: '[RTMP] publisher 192.168.1.45:58410 connected to path "live/test"'
      },
      {
        id: 'log-002',
        timestamp: new Date(Date.now() - 3599900).toISOString(),
        level: 'info',
        source: 'mediamtx',
        message: '[RTMP] path "live/test" tracks initialized: [H264 1920x1080 @ 60fps, AAC 48kHz stereo]'
      },
      {
        id: 'log-003',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        level: 'info',
        source: 'mediamtx',
        message: '[WebRTC] reader 10.0.0.12:61200 subscribed to path "live/test"'
      },
      {
        id: 'log-004',
        timestamp: new Date(Date.now() - 600000).toISOString(),
        level: 'info',
        source: 'system',
        message: 'Stream telemetry optimal: Target Bitrate 6.00 Mbps, Latency 2.01s, 0 Errors, 0 Discarded Frames'
      }
    ];
  }

  private startSimulationLoop() {
    this.timer = setInterval(() => {
      this.updateTelemetrySimulation();
      this.notifySubscribers();
    }, 1000);
  }

  private updateTelemetrySimulation() {
    const now = Date.now();
    this.host.uptimeSec = Math.floor((now - this.uptimeStart) / 1000) + 86400;

    // Small natural fluctuations around 6 Mbps target and 2.0s latency
    const testPath = this.paths.get('live/test');
    if (testPath && testPath.publisher) {
      // micro variation: 5920 to 6080 Kbps
      const jitterKbps = Math.floor((Math.sin(now / 1500) * 80) + (Math.random() * 40 - 20));
      const currentBitrate = 6000 + jitterKbps;

      testPath.publisher.currentBitrateKbps = currentBitrate;
      testPath.metrics.currentBitrateKbps = currentBitrate;

      // Latency fluctuation: 1980ms to 2020ms (~2.0s)
      const latJitter = Math.floor(Math.cos(now / 2000) * 15 + Math.random() * 10 - 5);
      testPath.metrics.latencyMs = 2000 + latJitter;

      // Ensure 0 errors and 0 discarded frames for live/test
      testPath.metrics.inboundErrors = 0;
      testPath.metrics.discardedFrames = 0;

      // Increment byte counters
      const bytesPerSec = Math.floor((currentBitrate * 1000) / 8);
      testPath.publisher.bytesReceived += bytesPerSec;
      testPath.bytesReceived += bytesPerSec;

      if (testPath.readers.length > 0) {
        testPath.readers[0].bytesSent += bytesPerSec;
        testPath.bytesSent += bytesPerSec;
      }
    }

    // Host CPU fluctuation around 12-18%
    this.host.cpuPercent = +(14 + Math.sin(now / 3000) * 2.5 + Math.random()).toFixed(1);
    this.host.networkInKbps = testPath ? testPath.metrics.currentBitrateKbps + 40 : 120;
    this.host.networkOutKbps = testPath ? (testPath.readers.length * testPath.metrics.currentBitrateKbps) + 80 : 120;
  }

  private notifySubscribers() {
    const snapshot: TelemetrySnapshot = {
      paths: Array.from(this.paths.values()),
      host: { ...this.host },
      timestamp: Date.now(),
      mediamtxConnected: true
    };

    this.subscribers.forEach((cb) => cb(snapshot));
  }

  getConfig(): ConnectionConfig {
    return { ...this.config };
  }

  async getHealth(): Promise<BackendHealth> {
    const pathList = Array.from(this.paths.values());
    let totalPubs = 0;
    let totalRds = 0;
    let totalBitrate = 0;

    pathList.forEach((p) => {
      if (p.publisher) totalPubs++;
      totalRds += p.readers.length;
      totalBitrate += p.metrics.currentBitrateKbps;
    });

    return {
      status: 'ok',
      uptime: this.host.uptimeSec,
      mediamtxConnected: true,
      activePathsCount: pathList.length,
      totalPublishers: totalPubs,
      totalReaders: totalRds,
      totalBitrateKbps: totalBitrate,
      appEnv: this.config.appEnv,
      mockMode: true
    };
  }

  async getPaths(): Promise<StreamPath[]> {
    return Array.from(this.paths.values());
  }

  async getPathDetails(name: string): Promise<StreamPath | null> {
    return this.paths.get(name) || null;
  }

  async getHostMetrics(): Promise<HostMetrics> {
    return { ...this.host };
  }

  async getCurrentMetrics(): Promise<CurrentMetrics> {
    return this.getHostMetrics();
  }

  async getStreams(): Promise<StreamInfo[]> {
    return this.getPaths();
  }

  async getExperiments(): Promise<Experiment[]> {
    return [...this.experiments];
  }

  async addLatencySample(experimentId: string, latencyMs: number): Promise<void> {
    const exp = this.experiments.find((e) => e.id === experimentId);
    if (exp) {
      exp.latencySamples.push(latencyMs);
      const sum = exp.latencySamples.reduce((a, b) => a + b, 0);
      exp.averageLatencyMs = +(sum / exp.latencySamples.length).toFixed(1);
    }
  }

  async startExperiment(experimentId: string): Promise<void> {
    const exp = this.experiments.find((e) => e.id === experimentId);
    if (exp) {
      exp.status = 'running';
      exp.startedAt = new Date().toISOString();
      delete exp.stoppedAt;
    }
  }

  async stopExperiment(experimentId: string): Promise<void> {
    const exp = this.experiments.find((e) => e.id === experimentId);
    if (exp) {
      exp.status = 'stopped';
      exp.stoppedAt = new Date().toISOString();
    }
  }


  async getLogs(limit: number = 50): Promise<LogEntry[]> {
    return this.logs.slice(-limit).reverse();
  }

  async kickReader(pathName: string, readerId: string): Promise<boolean> {
    const target = this.paths.get(pathName);
    if (!target) return false;

    const initialLen = target.readers.length;
    target.readers = target.readers.filter((r) => r.id !== readerId);
    if (target.readers.length < initialLen) {
      this.logs.push({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'mediamtx',
        message: `[Control API] Reader ${readerId} disconnected from path "${pathName}"`
      });
      return true;
    }
    return false;
  }

  async kickPublisher(pathName: string): Promise<boolean> {
    const target = this.paths.get(pathName);
    if (!target || !target.publisher) return false;

    target.publisher = null;
    target.ready = false;
    target.metrics.currentBitrateKbps = 0;
    this.logs.push({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'mediamtx',
      message: `[Control API] Publisher disconnected from path "${pathName}"`
    });
    return true;
  }

  async createPathConfig(pathName: string, configData?: Partial<StreamPath>): Promise<boolean> {
    const cleanName = pathName.trim();
    if (!cleanName) return false;

    const newPath: StreamPath = {
      name: cleanName,
      ready: true,
      tracks: configData?.tracks || ['H264', 'AAC'],
      bytesReceived: 0,
      bytesSent: 0,
      publisher: configData?.publisher || {
        id: `pub-${Date.now()}`,
        type: 'rtmpConn',
        remoteAddr: '192.168.1.100:51020',
        state: 'publishing',
        videoCodec: 'H.264',
        videoResolution: '1920x1080',
        videoFps: 30,
        audioCodec: 'AAC',
        audioSampleRate: 48000,
        audioChannels: 'stereo',
        targetBitrateKbps: 4500,
        currentBitrateKbps: 4500,
        connectedAt: new Date().toISOString(),
        bytesReceived: 0
      },
      readers: [],
      metrics: {
        currentBitrateKbps: 4500,
        targetBitrateKbps: 4500,
        latencyMs: 1850,
        inboundErrors: 0,
        discardedFrames: 0,
        fps: 30,
        jitterMs: 2.1,
        keyframeIntervalSec: 2.0
      }
    };

    this.paths.set(cleanName, newPath);
    this.logs.push({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'mediamtx',
      message: `[Control API] Created path configuration for "${cleanName}"`
    });
    return true;
  }

  async deletePathConfig(pathName: string): Promise<boolean> {
    if (pathName === 'live/test') {
      // Re-create default if deleted or reset
      this.initDefaultMockData();
      return true;
    }
    const res = this.paths.delete(pathName);
    if (res) {
      this.logs.push({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'info',
        source: 'mediamtx',
        message: `[Control API] Removed path configuration for "${pathName}"`
      });
    }
    return res;
  }

  subscribeLiveMetrics(callback: (data: TelemetrySnapshot) => void): () => void {
    this.subscribers.add(callback);
    // Emit current state immediately
    callback({
      paths: Array.from(this.paths.values()),
      host: { ...this.host },
      timestamp: Date.now(),
      mediamtxConnected: true
    });

    return () => {
      this.subscribers.delete(callback);
    };
  }
}
