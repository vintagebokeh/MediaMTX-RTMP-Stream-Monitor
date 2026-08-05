import {
  BackendHealth,
  ConnectionConfig,
  CurrentMetrics,
  Experiment,
  HealthResponse,
  HostMetrics,
  LogEntry,
  MonitoringApi,
  StreamInfo,
  StreamPath,
  TelemetrySnapshot
} from '../../types';

export interface IMonitorApiAdapter extends MonitoringApi {
  /**
   * Return adapter mode & connection properties
   */
  getConfig(): ConnectionConfig;

  /**
   * Get backend health and MediaMTX connectivity
   */
  getHealth(): Promise<BackendHealth>;

  /**
   * Get host system performance telemetry
   */
  getCurrentMetrics(): Promise<CurrentMetrics>;

  /**
   * Get all stream paths
   */
  getStreams(): Promise<StreamInfo[]>;

  /**
   * Get all stream paths with publisher/reader metrics
   */
  getPaths(): Promise<StreamPath[]>;

  /**
   * Get specific path by name (e.g. "live/test")
   */
  getPathDetails(name: string): Promise<StreamPath | null>;

  /**
   * Get host system performance telemetry
   */
  getHostMetrics(): Promise<HostMetrics>;

  /**
   * Fetch system/stream logs
   */
  getLogs(limit?: number): Promise<LogEntry[]>;

  /**
   * Disconnect a specific reader session
   */
  kickReader(pathName: string, readerId: string): Promise<boolean>;

  /**
   * Disconnect the publisher on a stream path
   */
  kickPublisher(pathName: string): Promise<boolean>;

  /**
   * Create or update a path configuration
   */
  createPathConfig(pathName: string, configData?: Partial<StreamPath>): Promise<boolean>;

  /**
   * Delete a path configuration
   */
  deletePathConfig(pathName: string): Promise<boolean>;

  /**
   * Subscribe to real-time telemetry updates (WebSockets or timer push)
   * Returns an unsubscribe cleanup function.
   */
  subscribeLiveMetrics(callback: (data: TelemetrySnapshot) => void): () => void;

  /**
   * Get active latency experiments
   */
  getExperiments(): Promise<Experiment[]>;

  /**
   * Record latency sample for experiment
   */
  addLatencySample(experimentId: string, latencyMs: number): Promise<void>;

  /**
   * Start experiment recording
   */
  startExperiment(experimentId: string): Promise<void>;

  /**
   * Stop experiment recording
   */
  stopExperiment(experimentId: string): Promise<void>;
}

