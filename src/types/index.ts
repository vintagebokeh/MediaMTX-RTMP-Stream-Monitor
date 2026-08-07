export type AppEnv = 'local' | 'lan' | 'remote';

export type RuntimeDataMode = 'real' | 'mock';

export function resolveRuntimeDataMode(flagRawValue?: string): RuntimeDataMode {
  return flagRawValue === 'true' ? 'mock' : 'real';
}

export type TelemetryState =
  | "OFFLINE"
  | "WARMING_UP"
  | "LIVE"
  | "STALE"
  | "BACKEND_OFFLINE"
  | "MEDIAMTX_OFFLINE";

export interface NormalizedStreamSnapshot {
  path: string;

  stream: {
    configured: boolean;
    ready: boolean;
    available: boolean;
    online: boolean;
    state: TelemetryState;
    readyTime: string | null;
    onlineTime: string | null;
  };

  publisher: {
    connected: boolean;
    type: "RTMP" | "RTSP" | "SRT" | "WHIP" | "UNKNOWN" | null;
    sourceType: string | null;
    id: string | null;
    remoteAddress: string | null;
  };

  readers: {
    count: number;
    items: Array<{
      type: string;
      id: string;
      remoteAddress: string | null;
    }>;
  };

  media: {
    tracks: string[];
    video: {
      codec: string | null;
      width: number | null;
      height: number | null;
      profile: string | null;
      level: string | null;
    };
    audio: {
      codec: string | null;
      sampleRate: number | null;
      channels: number | null;
    };
  };

  telemetry: {
    measuredBitrateKbps: number | null;
    inboundBytes: number | null;
    outboundBytes: number | null;
    inboundFramesInError: number | null;
    sampledAt: string;
    freshness: "live" | "stale" | "unavailable";
  };
}

export interface RuntimeDiagnostics {
  dataMode: RuntimeDataMode;
  mockEnabled: boolean;
  adapter: 'real' | 'mock';
  backendReachable: boolean;
  mediaMtxApiReachable: boolean;
  mediaMtxMetricsReachable: boolean;
  sampledAt: string;
}

export type TelemetrySource =
  | "mock"
  | "mediamtx-api"
  | "metrics"
  | "websocket"
  | "http-polling"
  | "unavailable";

export type TelemetryFreshness =
  | "live"
  | "stale"
  | "unavailable";

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
  videoFps: number | null; // 60
  audioCodec: string; // "AAC"
  audioSampleRate: number | null; // 48000
  audioChannels: string; // "stereo"
  targetBitrateKbps: number | null; // 6000
  configuredTargetBitrateKbps?: number | null;
  currentBitrateKbps: number | null;
  measuredBitrateKbps?: number | null;
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
  source: 'manual' | 'embedded_timestamp' | 'browser_estimate' | 'mock' | 'none';
  measuredAt: string | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface StreamMetrics {
  currentBitrateKbps: number | null;
  measuredBitrateKbps: number | null;
  targetBitrateKbps: number | null;
  configuredTargetBitrateKbps: number | null;
  latencyMs: number | null; // Configured latency target / MediaMTX buffer target
  configuredLatencyTargetMs: number | null;
  measuredLatencyMs: number | null;
  measuredLatency?: LatencyMeasurement | null;
  inboundErrors: number; // 0
  discardedFrames: number; // 0
  fps: number | null;
  jitterMs: number | null;
  keyframeIntervalSec: number | null;
  publisherConnected: boolean;
  streamAvailable: boolean;
  telemetrySource: TelemetrySource;
  telemetryFreshness: TelemetryFreshness;
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
  publisherConnected: boolean;
  streamAvailable: boolean;
  telemetrySource: TelemetrySource;
  telemetryFreshness: TelemetryFreshness;
  normalizedSnapshot?: NormalizedStreamSnapshot;
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
  status: 'ok' | 'degraded' | 'error' | 'offline';
  uptime: number;
  mediamtxConnected: boolean;
  activePathsCount: number;
  totalPublishers: number;
  totalReaders: number;
  totalBitrateKbps: number | null;
  measuredBitrateKbps: number | null;
  configuredTargetBitrateKbps: number | null;
  appEnv: AppEnv;
  mockMode: boolean;
  telemetrySource?: TelemetrySource;
  telemetryFreshness?: TelemetryFreshness;
  runtimeDiagnostics?: RuntimeDiagnostics;
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

export * from './persona';
export * from './memory';

