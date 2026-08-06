export interface SystemMemoryResponse {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  availablePercent: number;
  commitUsedBytes: null;
  commitLimitBytes: null;
  swapUsedBytes: null;
  sampledAt: string;
}

export type ResourceStatus = 'measured' | 'unavailable' | 'not_yet_sampled';
export type BaselineState = 'COLLECTING_BASELINE' | 'READY';

export interface ResourceCounts {
  videoElements: number;
  iframeElements: number;
  canvasElements: number;
  webSockets: number;
  activeTimers: number;
  activeAnimationLoops: number;
  resizeObservers: number;
  subscribers: number;
  videoInIframeStatus: ResourceStatus;
  censusState: BaselineState;
}

export interface MemorySample {
  sampledAt: string;
  browserHeapUsedBytes: number | null;
  browserHeapTotalBytes: number | null;
  browserHeapLimitBytes: number | null;
  browserHeapUsagePercent: number | null;
  hostTotalBytes?: number | null;
  hostUsedBytes: number | null;
  hostAvailableBytes: number | null;
  hostAvailablePercent: number | null;
  videoElementCount: number;
  iframeCount: number;
  canvasCount: number;
  webSocketCount: number;
  activeTimers: number;
  activeAnimationLoops: number;
  resizeObserverCount: number;
  subscriberCount: number;
  adapterInstanceId: string | null;
  telemetrySource: string | null;
}

export type MemoryHealthState = 'HEALTHY' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

export type LeakSuspicionState = 'STABLE' | 'POSSIBLE_LEAK' | 'LIKELY_LEAK';

export type MemoryTrendDirection = 'RISING' | 'FALLING' | 'STABLE';

export interface BrowserHeapMetrics {
  usedBytes: number | null;
  totalBytes: number | null;
  limitBytes: number | null;
  usagePercent: number | null;
  growthRateMBPerMin: number | null;
  peakBytes: number | null;
  lowestBytes: number | null;
  avg5mBytes: number | null;
  avg15mBytes: number | null;
  trend: MemoryTrendDirection;
  healthState: MemoryHealthState;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type:
    | 'WARNING_TRIGGERED'
    | 'CRITICAL_TRIGGERED'
    | 'EMERGENCY_TRIGGERED'
    | 'RECOVERY'
    | 'REMINDER_ALERT'
    | 'INFO';
  severity: MemoryHealthState;
  message: string;
  details: {
    hostAvailableBytes?: number | null;
    hostAvailablePercent?: number | null;
    browserHeapUsedBytes?: number | null;
    browserHeapUsagePercent?: number | null;
    declineRateMBPerMin?: number | null;
    projectedMinutesToCritical?: number | null;
    videoElementCount?: number;
    iframeCount?: number;
    canvasCount?: number;
    lowestAvailableMemoryBytes?: number | null;
    peakBrowserHeapBytes?: number | null;
    incidentDurationSec?: number;
  };
}

export interface IncidentRecord {
  id: string;
  timestamp: string;
  type: 'HEALTH_CHANGE' | 'LEAK_SUSPICION' | 'RECOVERY';
  hostAvailableBytes: number | null;
  hostAvailablePercent: number | null;
  browserHeapUsedBytes: number | null;
  browserHeapUsagePercent: number | null;
  browserHeapGrowthRateMBPerMin: number | null;
  resourceCounts: ResourceCounts;
  projectedMinutesToCritical: number | null;
  hostHealthState: MemoryHealthState;
  browserHeapHealthState: MemoryHealthState;
  overallHealthState: MemoryHealthState;
  leakSuspicionState: LeakSuspicionState;
  suspicionReason: string | null;
}

export interface MemoryDiagnosticSnapshot {
  samples: MemorySample[];
  telemetryHealth: string;
  adapterInstanceId: string | null;
  subscriberCount: number;
  activeTransport: string | null;
  resourceCounts: ResourceCounts;
  currentStreamPath: string;
  userAgent: string;
  appVersion: string;
  systemMemorySample: SystemMemoryResponse | null;
  auditEvents: AuditEvent[];
  incidentTimeline: IncidentRecord[];
  browserHeapSummary: BrowserHeapMetrics;
  capturedAt: string;
}

export interface MemoryMetricsSummary {
  latestSample: MemorySample | null;
  healthState: MemoryHealthState;
  hostHealthState: MemoryHealthState;
  browserHeapHealthState: MemoryHealthState;
  overallHealthState: MemoryHealthState;
  baselineState: BaselineState;
  leakSuspicion: LeakSuspicionState;
  suspicionReason: string | null;
  availableRAMBytes: number | null;
  usedRAMBytes: number | null;
  totalRAMBytes: number | null;
  availableRAMPercent: number | null;
  hostMemorySourceApi: string;
  browserHeapUsedBytes: number | null;
  browserHeapLimitBytes: number | null;
  browserHeap: BrowserHeapMetrics;
  resourceCounts: ResourceCounts;
  consumptionRateMBPerMin: number | null;
  trend1MinBytes: number | null;
  trend5MinBytes: number | null;
  trend15MinBytes: number | null;
  projectedMinutesToCritical: number | null;
  lastSampleTime: string | null;
  samples: MemorySample[];
  auditEvents: AuditEvent[];
  incidentTimeline: IncidentRecord[];
  lastIncident: IncidentRecord | null;
  lastRecovery: IncidentRecord | null;
  automaticDiagnosticSnapshot: MemoryDiagnosticSnapshot | null;
  incidentHistory: Array<{
    recoveryTime: string;
    lowestAvailableMemoryBytes: number | null;
    peakBrowserHeapBytes: number | null;
    incidentDurationSec: number;
  }>;
}

export interface MemoryMonitorConfig {
  sampleIntervalMs: number;
  historyMaxSamples: number;
  watchAvailablePercent: number;
  warningAvailablePercent: number;
  criticalAvailablePercent: number;
  emergencyAvailablePercent: number;
  warningProjectedMinutes: number;
  criticalProjectedMinutes: number;
  minDeclineRateMBPerMin: number;
  alertReminderMinutes: number;
  // New Browser Heap & Extended Protection Configs
  browserHeapWarningPercent: number;
  browserHeapCriticalPercent: number;
  browserHeapGrowthMBPerMin: number;
  jsHeapSampleIntervalMs: number;
  browserHeapHistoryMaxSamples: number;
  diagnosticExportMaxEvents: number;
  resourceSampleIntervalMs: number;
  resourceHistoryMaxSamples: number;
  enableBrowserHeapMonitor: boolean;
  enableResourceMonitor: boolean;
  enableHealthPrediction: boolean;
  enableLeakSuspicion: boolean;
  enableDebugOverlay: boolean;
}

