export type AppEnv = 'local' | 'lan' | 'remote';

export interface ConnectionConfig {
  apiUrl: string;
  wsUrl: string;
  appEnv: AppEnv;
  useMockData: boolean;
}

export interface PublisherInfo {
  id: string;
  type: string; // e.g. "rtmpConn", "rtspsPublisher", "whipPublisher"
  remoteAddr: string;
  state: 'publishing' | 'idle' | 'error';
  videoCodec: string; // "H.264"
  videoResolution: string; // "1920x1080"
  videoFps: number; // 60
  audioCodec: string; // "AAC"
  audioSampleRate: number; // 48000
  audioChannels: string; // "stereo"
  targetBitrateKbps: number; // 6000
  currentBitrateKbps: number;
  connectedAt: string;
  bytesReceived: number;
}

export interface ReaderInfo {
  id: string;
  type: string; // "rtmpConn", "hlsMuxer", "webrtcConn"
  remoteAddr: string;
  protocol: string; // "WebRTC" | "HLS" | "RTMP" | "RTSP"
  connectedAt: string;
  bytesSent: number;
}

export interface LatencyMeasurement {
  valueMs: number | null;
  source: 'manual' | 'embedded_timestamp' | 'browser_estimate' | 'mock';
  measuredAt: string | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface StreamMetrics {
  currentBitrateKbps: number;
  targetBitrateKbps: number;
  latencyMs: number; // Configured latency target / MediaMTX buffer target
  configuredLatencyTargetMs?: number;
  measuredLatency?: LatencyMeasurement | null;
  inboundErrors: number; // 0
  discardedFrames: number; // 0
  fps: number;
  jitterMs: number;
  keyframeIntervalSec: number;
}

export interface StreamPath {
  name: string; // e.g., "live/test"
  ready: boolean;
  tracks: string[]; // ["H264", "AAC"]
  bytesReceived: number;
  bytesSent: number;
  publisher: PublisherInfo | null;
  readers: ReaderInfo[];
  metrics: StreamMetrics;
}

export type StreamInfo = StreamPath;

export interface HostMetrics {
  cpuPercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  diskPercent: number;
  networkInKbps: number;
  networkOutKbps: number;
  uptimeSec: number;
  mediamtxProcessCpu: number;
  mediamtxProcessRamMB: number;
}

export type CurrentMetrics = HostMetrics;

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'mediamtx' | 'backend' | 'rtmp' | 'hls' | 'system';
  message: string;
}

export interface TelemetrySnapshot {
  paths: StreamPath[];
  host: HostMetrics;
  timestamp: number;
  mediamtxConnected: boolean;
}

export interface BackendHealth {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  mediamtxConnected: boolean;
  activePathsCount: number;
  totalPublishers: number;
  totalReaders: number;
  totalBitrateKbps: number;
  appEnv: AppEnv;
  mockMode: boolean;
}

export type HealthResponse = BackendHealth;

export interface Experiment {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'completed';
  startedAt?: string;
  stoppedAt?: string;
  targetLatencyMs: number;
  latencySamples: number[];
  averageLatencyMs: number;
}

export interface RuntimeConfig {
  environment: 'local' | 'lan' | 'remote' | string;
  streamPath: string;
  playback: {
    webrtcUrl: string | null;
    hlsUrl: string | null;
  };
  features: {
    livePreviewEnabled: boolean;
  };
}

export interface MonitoringApi {
  getRuntimeConfig(): Promise<RuntimeConfig>;
  getHealth(): Promise<HealthResponse>;
  getCurrentMetrics(): Promise<CurrentMetrics>;
  getStreams(): Promise<StreamInfo[]>;

  getLatestLatencySample(streamPath?: string): Promise<LatencyMeasurement>;
  recordLatencySample(
    streamPath: string,
    latencyMs: number,
    source?: 'manual' | 'embedded_timestamp' | 'browser_estimate' | 'mock'
  ): Promise<LatencyMeasurement>;

  getExperiments(): Promise<Experiment[]>;
  addLatencySample(
    experimentId: string,
    latencyMs: number
  ): Promise<void>;

  startExperiment(experimentId: string): Promise<void>;
  stopExperiment(experimentId: string): Promise<void>;
}

