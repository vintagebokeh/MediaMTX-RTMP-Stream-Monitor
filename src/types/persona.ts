export type DashboardPersona = "operator" | "producer" | "client";

export interface DashboardBaseViewModel {
  serviceName: string;
  status: "online" | "warning" | "offline";
  streamPath: string | null;
  uptimeSeconds: number | null;
  previewUrl: string | null;
  lastUpdated: string;
}

export interface ProducerDashboardViewModel extends DashboardBaseViewModel {
  resolution: string | null;
  frameRate: number | null;
  audioDetected: boolean;
  latencyMs: number | null;
  publisherConnected: boolean;
  readerCount: number;
}

export interface ClientDashboardViewModel extends DashboardBaseViewModel {
  publicStatusMessage: string;
  qualityLabel: "Excellent" | "Good" | "Degraded" | "Unavailable";
  viewerCount: number | null;
  startTime: string | null;
}
