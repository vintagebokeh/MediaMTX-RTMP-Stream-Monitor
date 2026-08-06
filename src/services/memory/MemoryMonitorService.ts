import {
  AuditEvent,
  BaselineState,
  BrowserHeapMetrics,
  IncidentRecord,
  LeakSuspicionState,
  MemoryDiagnosticSnapshot,
  MemoryHealthState,
  MemoryMetricsSummary,
  MemoryMonitorConfig,
  MemorySample,
  ResourceCounts,
  ResourceStatus,
  SystemMemoryResponse
} from '../../types/memory';
import {
  getAnimationLoopCount,
  getActiveTimerCount,
  getActiveWebSocketCount,
  getActiveResizeObserverCount
} from '../api/telemetryDebug';

function getEnvNumber(key: string, defaultValue: number): number {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    const parsed = parseInt(process.env[key]!, 10);
    if (!isNaN(parsed)) return parsed;
  }
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env[`VITE_${key}`]
  ) {
    const parsed = parseInt(String(import.meta.env[`VITE_${key}`]), 10);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key] === 'true';
  }
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env[`VITE_${key}`] !== undefined
  ) {
    return String(import.meta.env[`VITE_${key}`]) === 'true';
  }
  return defaultValue;
}

export const DEFAULT_MEMORY_CONFIG: MemoryMonitorConfig = {
  sampleIntervalMs: getEnvNumber('MEMORY_SAMPLE_INTERVAL_MS', 10000),
  historyMaxSamples: getEnvNumber('MEMORY_HISTORY_MAX_SAMPLES', 360),
  watchAvailablePercent: getEnvNumber('MEMORY_WATCH_AVAILABLE_PERCENT', 30),
  warningAvailablePercent: getEnvNumber('MEMORY_WARNING_AVAILABLE_PERCENT', 20),
  criticalAvailablePercent: getEnvNumber('MEMORY_CRITICAL_AVAILABLE_PERCENT', 10),
  emergencyAvailablePercent: getEnvNumber('MEMORY_EMERGENCY_AVAILABLE_PERCENT', 5),
  warningProjectedMinutes: getEnvNumber('MEMORY_WARNING_PROJECTED_MINUTES', 30),
  criticalProjectedMinutes: getEnvNumber('MEMORY_CRITICAL_PROJECTED_MINUTES', 10),
  minDeclineRateMBPerMin: getEnvNumber('MEMORY_MIN_DECLINE_RATE_MB_PER_MIN', 100),
  alertReminderMinutes: getEnvNumber('MEMORY_ALERT_REMINDER_MINUTES', 15),

  // Extended Browser Memory Protection & Diagnostic Configs
  browserHeapWarningPercent: getEnvNumber('MEMORY_BROWSER_HEAP_WARNING_PERCENT', 80),
  browserHeapCriticalPercent: getEnvNumber('MEMORY_BROWSER_HEAP_CRITICAL_PERCENT', 90),
  browserHeapGrowthMBPerMin: getEnvNumber('MEMORY_BROWSER_HEAP_GROWTH_MB_PER_MIN', 50),
  jsHeapSampleIntervalMs: getEnvNumber('MEMORY_JS_HEAP_SAMPLE_INTERVAL_MS', 10000),
  browserHeapHistoryMaxSamples: getEnvNumber('MEMORY_BROWSER_HEAP_HISTORY_MAX_SAMPLES', 720),
  diagnosticExportMaxEvents: getEnvNumber('MEMORY_DIAGNOSTIC_EXPORT_MAX_EVENTS', 200),
  resourceSampleIntervalMs: getEnvNumber('MEMORY_RESOURCE_SAMPLE_INTERVAL_MS', 30000),
  resourceHistoryMaxSamples: getEnvNumber('MEMORY_RESOURCE_HISTORY_MAX_SAMPLES', 360),
  enableBrowserHeapMonitor: getEnvBoolean('MEMORY_ENABLE_BROWSER_HEAP_MONITOR', true),
  enableResourceMonitor: getEnvBoolean('MEMORY_ENABLE_RESOURCE_MONITOR', true),
  enableHealthPrediction: getEnvBoolean('MEMORY_ENABLE_HEALTH_PREDICTION', true),
  enableLeakSuspicion: getEnvBoolean('MEMORY_ENABLE_LEAK_SUSPICION', true),
  enableDebugOverlay: getEnvBoolean('MEMORY_ENABLE_DEBUG_OVERLAY', false)
};

export class MemoryMonitorService {
  private config: MemoryMonitorConfig;
  private samples: MemorySample[] = [];
  private auditEvents: AuditEvent[] = [];
  private incidentTimeline: IncidentRecord[] = [];
  private listeners: Set<() => void> = new Set();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private adapterInstanceId: string | null = null;
  private telemetrySource: string | null = 'websocket';
  private currentStreamPath = 'live/test';

  private lastAlertSeverity: MemoryHealthState = 'HEALTHY';
  private lastAlertTimestamp: number = 0;
  private incidentStartTimestamp: number | null = null;
  private incidentLowestHostAvailableBytes: number | null = null;
  private incidentPeakBrowserHeapBytes: number | null = null;

  private lastIncident: IncidentRecord | null = null;
  private lastRecovery: IncidentRecord | null = null;
  private automaticDiagnosticSnapshot: MemoryDiagnosticSnapshot | null = null;

  private incidentHistory: Array<{
    recoveryTime: string;
    lowestAvailableMemoryBytes: number | null;
    peakBrowserHeapBytes: number | null;
    incidentDurationSec: number;
  }> = [];

  private mockTotalRAMBytes = 32 * 1024 * 1024 * 1024; // 32 GB
  private mockAvailableRAMBytes = 24 * 1024 * 1024 * 1024; // 24 GB

  constructor(customConfig?: Partial<MemoryMonitorConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...customConfig };
  }

  public setAdapterInfo(instanceId: string | null, source: string | null = 'websocket') {
    this.adapterInstanceId = instanceId;
    this.telemetrySource = source;
  }

  public setStreamPath(path: string) {
    this.currentStreamPath = path;
  }

  public start() {
    if (this.timerId !== null) return;
    this.sampleMemory();
    this.timerId = setInterval(() => {
      this.sampleMemory();
    }, this.config.sampleIntervalMs);
  }

  public stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public dispose() {
    this.stop();
    this.listeners.clear();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('Error in MemoryMonitorService listener:', err);
      }
    });
  }

  public async fetchSystemMemory(): Promise<SystemMemoryResponse> {
    if (typeof window !== 'undefined' && fetch) {
      try {
        const resp = await fetch('/api/v1/system-memory');
        if (resp.ok) {
          const data: SystemMemoryResponse = await resp.json();
          this.mockTotalRAMBytes = data.totalBytes;
          this.mockAvailableRAMBytes = data.availableBytes;
          return data;
        }
      } catch (e) {
        // Fallback below
      }
    }

    const totalBytes = this.mockTotalRAMBytes;
    const availableBytes = this.mockAvailableRAMBytes;
    const usedBytes = totalBytes - availableBytes;
    const availablePercent = Math.round((availableBytes / totalBytes) * 100);

    return {
      totalBytes,
      usedBytes,
      availableBytes,
      availablePercent,
      commitUsedBytes: null,
      commitLimitBytes: null,
      swapUsedBytes: null,
      sampledAt: new Date().toISOString()
    };
  }

  public async sampleMemory(): Promise<MemorySample> {
    const sysMem = await this.fetchSystemMemory();

    let browserHeapUsedBytes: number | null = null;
    let browserHeapTotalBytes: number | null = null;
    let browserHeapLimitBytes: number | null = null;
    let browserHeapUsagePercent: number | null = null;

    if (
      typeof window !== 'undefined' &&
      (window.performance as any) &&
      (window.performance as any).memory
    ) {
      const perfMem = (window.performance as any).memory;
      browserHeapUsedBytes = perfMem.usedJSHeapSize ?? null;
      browserHeapTotalBytes = perfMem.totalJSHeapSize ?? null;
      browserHeapLimitBytes = perfMem.jsHeapSizeLimit ?? null;

      if (browserHeapUsedBytes !== null) {
        const denom = browserHeapLimitBytes && browserHeapLimitBytes > 0
          ? browserHeapLimitBytes
          : browserHeapTotalBytes && browserHeapTotalBytes > 0
            ? browserHeapTotalBytes
            : null;
        if (denom) {
          browserHeapUsagePercent = +((browserHeapUsedBytes / denom) * 100).toFixed(1);
        }
      }
    }

    let videoElementCount = 0;
    let iframeCount = 0;
    let canvasCount = 0;

    if (typeof document !== 'undefined') {
      videoElementCount = document.getElementsByTagName('video').length;
      iframeCount = document.getElementsByTagName('iframe').length;
      canvasCount = document.getElementsByTagName('canvas').length;
    }

    const activeAnimationLoops = getAnimationLoopCount();
    const activeTimers = getActiveTimerCount();
    const webSocketCount = getActiveWebSocketCount() || (this.telemetrySource === 'websocket' ? 1 : 0);
    const resizeObserverCount = getActiveResizeObserverCount();
    const subscriberCount = this.listeners.size;

    const sample: MemorySample = {
      sampledAt: new Date().toISOString(),
      browserHeapUsedBytes,
      browserHeapTotalBytes,
      browserHeapLimitBytes,
      browserHeapUsagePercent,
      hostTotalBytes: sysMem.totalBytes,
      hostUsedBytes: sysMem.usedBytes,
      hostAvailableBytes: sysMem.availableBytes,
      hostAvailablePercent: sysMem.availablePercent,
      videoElementCount,
      iframeCount,
      canvasCount,
      webSocketCount,
      activeTimers,
      activeAnimationLoops,
      resizeObserverCount,
      subscriberCount,
      adapterInstanceId: this.adapterInstanceId,
      telemetrySource: this.telemetrySource
    };

    const maxSamples = Math.max(
      this.config.historyMaxSamples,
      this.config.browserHeapHistoryMaxSamples
    );

    this.samples.push(sample);
    if (this.samples.length > maxSamples) {
      this.samples = this.samples.slice(-maxSamples);
    }

    this.evaluateAlertsAndRecovery();

    this.notifyListeners();
    return sample;
  }

  public addDirectSample(sample: MemorySample) {
    const maxSamples = Math.max(
      this.config.historyMaxSamples,
      this.config.browserHeapHistoryMaxSamples
    );
    this.samples.push(sample);
    if (this.samples.length > maxSamples) {
      this.samples = this.samples.slice(-maxSamples);
    }
    this.evaluateAlertsAndRecovery();
    this.notifyListeners();
  }

  public getSamples(): MemorySample[] {
    return [...this.samples];
  }

  public getLatestSample(): MemorySample | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
  }

  public getAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }

  private addAuditEvent(event: AuditEvent) {
    this.auditEvents.push(event);
    if (this.auditEvents.length > this.config.diagnosticExportMaxEvents) {
      this.auditEvents = this.auditEvents.slice(-this.config.diagnosticExportMaxEvents);
    }
  }

  public calculateRatesAndTrends() {
    const count = this.samples.length;
    if (count === 0) {
      return {
        consumptionRateMBPerMin: null,
        browserHeapGrowthRateMBPerMin: null,
        trend1MinBytes: null,
        trend5MinBytes: null,
        trend15MinBytes: null,
        projectedMinutesToCritical: null
      };
    }

    const current = this.samples[count - 1];
    const nowMs = new Date(current.sampledAt).getTime();

    const findSampleAgo = (minutesAgo: number) => {
      const targetMs = nowMs - minutesAgo * 60 * 1000;
      for (let i = count - 1; i >= 0; i--) {
        const sMs = new Date(this.samples[i].sampledAt).getTime();
        if (sMs <= targetMs) {
          return this.samples[i];
        }
      }
      return null;
    };

    const s1Min = findSampleAgo(1);
    const s5Min = findSampleAgo(5);
    const s15Min = findSampleAgo(15);

    const trend1MinBytes =
      s1Min && current.hostAvailableBytes !== null && s1Min.hostAvailableBytes !== null
        ? current.hostAvailableBytes - s1Min.hostAvailableBytes
        : null;

    const trend5MinBytes =
      s5Min && current.hostAvailableBytes !== null && s5Min.hostAvailableBytes !== null
        ? current.hostAvailableBytes - s5Min.hostAvailableBytes
        : null;

    const trend15MinBytes =
      s15Min && current.hostAvailableBytes !== null && s15Min.hostAvailableBytes !== null
        ? current.hostAvailableBytes - s15Min.hostAvailableBytes
        : null;

    let consumptionRateMBPerMin: number | null = null;
    let browserHeapGrowthRateMBPerMin: number | null = null;

    const oldSampleForRate = s5Min || (count >= 6 ? this.samples[0] : null);
    if (
      oldSampleForRate &&
      current.hostAvailableBytes !== null &&
      oldSampleForRate.hostAvailableBytes !== null
    ) {
      const elapsedMs = nowMs - new Date(oldSampleForRate.sampledAt).getTime();
      const elapsedMin = elapsedMs / (60 * 1000);
      if (elapsedMin > 0) {
        const declineBytes = oldSampleForRate.hostAvailableBytes - current.hostAvailableBytes;
        consumptionRateMBPerMin = +(
          declineBytes /
          (1024 * 1024) /
          elapsedMin
        ).toFixed(1);
      }
    }

    if (
      oldSampleForRate &&
      current.browserHeapUsedBytes !== null &&
      oldSampleForRate.browserHeapUsedBytes !== null
    ) {
      const elapsedMs = nowMs - new Date(oldSampleForRate.sampledAt).getTime();
      const elapsedMin = elapsedMs / (60 * 1000);
      if (elapsedMin > 0) {
        const growthBytes = current.browserHeapUsedBytes - oldSampleForRate.browserHeapUsedBytes;
        browserHeapGrowthRateMBPerMin = +(
          growthBytes /
          (1024 * 1024) /
          elapsedMin
        ).toFixed(1);
      }
    }

    let projectedMinutesToCritical: number | null = null;

    const has5MinData =
      count >= 30 ||
      (this.samples.length > 0 &&
        nowMs - new Date(this.samples[0].sampledAt).getTime() >= 5 * 60 * 1000);

    const totalRAM = this.mockTotalRAMBytes;
    const criticalAvailableBytes = (totalRAM * this.config.criticalAvailablePercent) / 100;
    const currentAvailableBytes = current.hostAvailableBytes;

    if (
      this.config.enableHealthPrediction &&
      has5MinData &&
      currentAvailableBytes !== null &&
      consumptionRateMBPerMin !== null &&
      consumptionRateMBPerMin >= this.config.minDeclineRateMBPerMin &&
      currentAvailableBytes > criticalAvailableBytes
    ) {
      const sustainedBytesPerMin = consumptionRateMBPerMin * 1024 * 1024;
      if (sustainedBytesPerMin > 0) {
        const bytesToCritical = currentAvailableBytes - criticalAvailableBytes;
        projectedMinutesToCritical = Math.max(
          0,
          Math.round(bytesToCritical / sustainedBytesPerMin)
        );
      }
    }

    return {
      consumptionRateMBPerMin,
      browserHeapGrowthRateMBPerMin,
      trend1MinBytes,
      trend5MinBytes,
      trend15MinBytes,
      projectedMinutesToCritical
    };
  }

  public getHostHealthState(): MemoryHealthState {
    const latest = this.getLatestSample();
    if (!latest) return 'HEALTHY';

    const { consumptionRateMBPerMin, projectedMinutesToCritical } =
      this.calculateRatesAndTrends();

    const availPct = latest.hostAvailablePercent;

    if (availPct !== null && availPct <= this.config.emergencyAvailablePercent) {
      return 'EMERGENCY';
    }

    if (
      (availPct !== null && availPct <= this.config.criticalAvailablePercent) ||
      (projectedMinutesToCritical !== null &&
        projectedMinutesToCritical <= this.config.criticalProjectedMinutes)
    ) {
      return 'CRITICAL';
    }

    if (
      (availPct !== null && availPct <= this.config.warningAvailablePercent) ||
      (projectedMinutesToCritical !== null &&
        projectedMinutesToCritical <= this.config.warningProjectedMinutes)
    ) {
      return 'WARNING';
    }

    if (
      (availPct !== null && availPct <= this.config.watchAvailablePercent) ||
      (consumptionRateMBPerMin !== null &&
        consumptionRateMBPerMin >= this.config.minDeclineRateMBPerMin)
    ) {
      return 'WATCH';
    }

    return 'HEALTHY';
  }

  public getBrowserHeapHealthState(): MemoryHealthState {
    if (!this.config.enableBrowserHeapMonitor) return 'HEALTHY';
    const latest = this.getLatestSample();
    if (!latest) return 'HEALTHY';

    const { browserHeapGrowthRateMBPerMin } = this.calculateRatesAndTrends();
    const usagePct = latest.browserHeapUsagePercent ?? 0;
    const usedBytes = latest.browserHeapUsedBytes ?? 0;
    const limitBytes = latest.browserHeapLimitBytes ?? 0;

    if ((limitBytes > 0 && usedBytes / limitBytes >= 0.95) || usagePct >= 95) {
      return 'EMERGENCY';
    }

    if (usagePct >= this.config.browserHeapCriticalPercent) {
      return 'CRITICAL';
    }

    if (
      usagePct >= this.config.browserHeapWarningPercent ||
      (browserHeapGrowthRateMBPerMin !== null &&
        browserHeapGrowthRateMBPerMin >= this.config.browserHeapGrowthMBPerMin)
    ) {
      return 'WARNING';
    }

    if (
      usagePct >= 70 ||
      (browserHeapGrowthRateMBPerMin !== null && browserHeapGrowthRateMBPerMin >= 25)
    ) {
      return 'WATCH';
    }

    return 'HEALTHY';
  }

  public getHealthState(): MemoryHealthState {
    const hostHealth = this.getHostHealthState();
    const browserHealth = this.getBrowserHeapHealthState();

    const severityOrder: Record<MemoryHealthState, number> = {
      HEALTHY: 0,
      WATCH: 1,
      WARNING: 2,
      CRITICAL: 3,
      EMERGENCY: 4
    };

    return severityOrder[hostHealth] >= severityOrder[browserHealth] ? hostHealth : browserHealth;
  }

  public getBrowserHeapMetrics(): BrowserHeapMetrics {
    const latest = this.getLatestSample();
    const { browserHeapGrowthRateMBPerMin } = this.calculateRatesAndTrends();
    const healthState = this.getBrowserHeapHealthState();

    if (this.samples.length === 0 || !latest) {
      return {
        usedBytes: null,
        totalBytes: null,
        limitBytes: null,
        usagePercent: null,
        growthRateMBPerMin: null,
        peakBytes: null,
        lowestBytes: null,
        avg5mBytes: null,
        avg15mBytes: null,
        trend: 'STABLE',
        healthState: 'HEALTHY'
      };
    }

    let peakBytes: number | null = null;
    let lowestBytes: number | null = null;
    let sum5m = 0;
    let count5m = 0;
    let sum15m = 0;
    let count15m = 0;

    const nowMs = new Date(latest.sampledAt).getTime();
    const ms5mAgo = nowMs - 5 * 60 * 1000;
    const ms15mAgo = nowMs - 15 * 60 * 1000;

    this.samples.forEach((s) => {
      const u = s.browserHeapUsedBytes;
      if (u !== null) {
        if (peakBytes === null || u > peakBytes) peakBytes = u;
        if (lowestBytes === null || u < lowestBytes) lowestBytes = u;

        const sMs = new Date(s.sampledAt).getTime();
        if (sMs >= ms5mAgo) {
          sum5m += u;
          count5m++;
        }
        if (sMs >= ms15mAgo) {
          sum15m += u;
          count15m++;
        }
      }
    });

    const avg5mBytes = count5m > 0 ? Math.round(sum5m / count5m) : null;
    const avg15mBytes = count15m > 0 ? Math.round(sum15m / count15m) : null;

    let trend: 'RISING' | 'FALLING' | 'STABLE' = 'STABLE';
    if (browserHeapGrowthRateMBPerMin !== null) {
      if (browserHeapGrowthRateMBPerMin > 5) trend = 'RISING';
      else if (browserHeapGrowthRateMBPerMin < -5) trend = 'FALLING';
    }

    return {
      usedBytes: latest.browserHeapUsedBytes,
      totalBytes: latest.browserHeapTotalBytes,
      limitBytes: latest.browserHeapLimitBytes,
      usagePercent: latest.browserHeapUsagePercent,
      growthRateMBPerMin: browserHeapGrowthRateMBPerMin,
      peakBytes,
      lowestBytes,
      avg5mBytes,
      avg15mBytes,
      trend,
      healthState
    };
  }

  public getBaselineState(): BaselineState {
    if (this.samples.length < 2) return 'COLLECTING_BASELINE';
    const first = this.samples[0];
    const latest = this.samples[this.samples.length - 1];
    const spanMs = new Date(latest.sampledAt).getTime() - new Date(first.sampledAt).getTime();
    if (spanMs >= 5 * 60 * 1000 || this.samples.length >= 30) {
      return 'READY';
    }
    return 'COLLECTING_BASELINE';
  }

  public getResourceCounts(): ResourceCounts {
    const latest = this.getLatestSample();
    const videoElements = latest?.videoElementCount ?? 0;
    const iframeElements = latest?.iframeCount ?? 0;

    let videoInIframeStatus: ResourceStatus = 'measured';
    if (!latest) {
      videoInIframeStatus = 'not_yet_sampled';
    } else if (iframeElements > 0 && videoElements === 0) {
      videoInIframeStatus = 'unavailable';
    }

    return {
      videoElements,
      iframeElements,
      canvasElements: latest?.canvasCount ?? 0,
      webSockets: latest?.webSocketCount ?? 0,
      activeTimers: latest?.activeTimers ?? 0,
      activeAnimationLoops: latest?.activeAnimationLoops ?? 0,
      resizeObservers: latest?.resizeObserverCount ?? 0,
      subscribers: latest?.subscriberCount ?? this.listeners.size,
      videoInIframeStatus,
      censusState: this.getBaselineState()
    };
  }

  public getCorrelationAnalysis(): { leakSuspicion: LeakSuspicionState; suspicionReason: string | null } {
    if (!this.config.enableLeakSuspicion) {
      return { leakSuspicion: 'STABLE', suspicionReason: null };
    }

    if (this.getBaselineState() === 'COLLECTING_BASELINE') {
      return {
        leakSuspicion: 'STABLE',
        suspicionReason: 'Collecting baseline metrics (5 min window required).'
      };
    }

    const count = this.samples.length;
    const latest = this.samples[count - 1];
    const { browserHeapGrowthRateMBPerMin } = this.calculateRatesAndTrends();
    const heapUsagePct = latest.browserHeapUsagePercent ?? 0;
    const isHeapRising = (browserHeapGrowthRateMBPerMin ?? 0) > 10 || heapUsagePct >= 75;

    const vCount = latest.videoElementCount;
    const iCount = latest.iframeCount;
    const cCount = latest.canvasCount;
    const animCount = latest.activeAnimationLoops;
    const timerCount = latest.activeTimers;
    const wsCount = latest.webSocketCount;

    if (!isHeapRising) {
      return { leakSuspicion: 'STABLE', suspicionReason: 'Browser heap allocation is stable.' };
    }

    if (vCount >= 3) {
      return {
        leakSuspicion: 'POSSIBLE_LEAK',
        suspicionReason: `Browser heap rising alongside ${vCount} active video elements -> Possible media cleanup issue.`
      };
    }

    if (cCount >= 4) {
      return {
        leakSuspicion: 'POSSIBLE_LEAK',
        suspicionReason: `Browser heap rising alongside ${cCount} canvas elements -> Possible canvas render context retention.`
      };
    }

    if (animCount >= 3) {
      return {
        leakSuspicion: 'LIKELY_LEAK',
        suspicionReason: `Browser heap rising while ${animCount} active animation loops running -> Possible requestAnimationFrame loop allocation leak.`
      };
    }

    if (wsCount >= 3 || timerCount >= 10) {
      return {
        leakSuspicion: 'POSSIBLE_LEAK',
        suspicionReason: `Browser heap rising with elevated WebSockets (${wsCount}) or timers (${timerCount}) -> Possible network/timer closure leak.`
      };
    }

    if (vCount <= 2 && iCount <= 2 && cCount <= 2 && animCount <= 2) {
      return {
        leakSuspicion: 'POSSIBLE_LEAK',
        suspicionReason: 'Browser heap rising while DOM elements and animation loops remain stable -> Possible JavaScript object allocation leak.'
      };
    }

    return {
      leakSuspicion: 'POSSIBLE_LEAK',
      suspicionReason: 'Browser heap growth rate elevated -> General heap retention suspicious.'
    };
  }

  public getLeakSuspicionState(): LeakSuspicionState {
    return this.getCorrelationAnalysis().leakSuspicion;
  }

  private evaluateAlertsAndRecovery() {
    const currentState = this.getHealthState();
    const latest = this.getLatestSample();
    const now = Date.now();
    const correlation = this.getCorrelationAnalysis();

    if (currentState !== 'HEALTHY') {
      if (this.incidentStartTimestamp === null) {
        this.incidentStartTimestamp = now;
      }
      if (latest) {
        if (
          latest.hostAvailableBytes !== null &&
          (this.incidentLowestHostAvailableBytes === null ||
            latest.hostAvailableBytes < this.incidentLowestHostAvailableBytes)
        ) {
          this.incidentLowestHostAvailableBytes = latest.hostAvailableBytes;
        }
        if (
          latest.browserHeapUsedBytes !== null &&
          (this.incidentPeakBrowserHeapBytes === null ||
            latest.browserHeapUsedBytes > this.incidentPeakBrowserHeapBytes)
        ) {
          this.incidentPeakBrowserHeapBytes = latest.browserHeapUsedBytes;
        }
      }
    }

    const severityLevel = (s: MemoryHealthState) => {
      switch (s) {
        case 'HEALTHY':
          return 0;
        case 'WATCH':
          return 1;
        case 'WARNING':
          return 2;
        case 'CRITICAL':
          return 3;
        case 'EMERGENCY':
          return 4;
      }
    };

    const currentLevel = severityLevel(currentState);
    const lastLevel = severityLevel(this.lastAlertSeverity);

    // Auto capture diagnostic snapshot when entering WARNING or higher
    if (currentLevel >= 2) {
      this.automaticDiagnosticSnapshot = this.getDiagnosticSnapshot();
    }

    // Record Incident Timeline Record if status shifted
    if (currentLevel !== lastLevel) {
      const { consumptionRateMBPerMin, browserHeapGrowthRateMBPerMin, projectedMinutesToCritical } =
        this.calculateRatesAndTrends();

      const incRecord: IncidentRecord = {
        id: `inc-${now}`,
        timestamp: new Date().toISOString(),
        type: currentState === 'HEALTHY' ? 'RECOVERY' : 'HEALTH_CHANGE',
        hostAvailableBytes: latest?.hostAvailableBytes ?? null,
        hostAvailablePercent: latest?.hostAvailablePercent ?? null,
        browserHeapUsedBytes: latest?.browserHeapUsedBytes ?? null,
        browserHeapUsagePercent: latest?.browserHeapUsagePercent ?? null,
        browserHeapGrowthRateMBPerMin: browserHeapGrowthRateMBPerMin ?? null,
        resourceCounts: this.getResourceCounts(),
        projectedMinutesToCritical,
        hostHealthState: this.getHostHealthState(),
        browserHeapHealthState: this.getBrowserHeapHealthState(),
        overallHealthState: currentState,
        leakSuspicionState: correlation.leakSuspicion,
        suspicionReason: correlation.suspicionReason
      };

      this.incidentTimeline.unshift(incRecord);
      if (this.incidentTimeline.length > 50) {
        this.incidentTimeline = this.incidentTimeline.slice(0, 50);
      }

      if (currentState === 'HEALTHY') {
        this.lastRecovery = incRecord;
      } else {
        this.lastIncident = incRecord;
      }
    }

    // 1. Check for Recovery
    if (
      (this.lastAlertSeverity === 'WARNING' ||
        this.lastAlertSeverity === 'CRITICAL' ||
        this.lastAlertSeverity === 'EMERGENCY') &&
      (currentState === 'HEALTHY' || currentState === 'WATCH')
    ) {
      const incidentDurationSec = this.incidentStartTimestamp
        ? Math.round((now - this.incidentStartTimestamp) / 1000)
        : 0;

      const recoveryTime = new Date().toISOString();
      this.incidentHistory.push({
        recoveryTime,
        lowestAvailableMemoryBytes: this.incidentLowestHostAvailableBytes,
        peakBrowserHeapBytes: this.incidentPeakBrowserHeapBytes,
        incidentDurationSec
      });

      this.addAuditEvent({
        id: `audit-rec-${now}`,
        timestamp: recoveryTime,
        type: 'RECOVERY',
        severity: 'HEALTHY',
        message: `Memory state recovered from ${this.lastAlertSeverity} to ${currentState}`,
        details: {
          lowestAvailableMemoryBytes: this.incidentLowestHostAvailableBytes,
          peakBrowserHeapBytes: this.incidentPeakBrowserHeapBytes,
          incidentDurationSec
        }
      });

      this.incidentStartTimestamp = null;
      this.incidentLowestHostAvailableBytes = null;
      this.incidentPeakBrowserHeapBytes = null;
      this.lastAlertSeverity = currentState;
      this.lastAlertTimestamp = now;
      return;
    }

    // 2. Elevated alert trigger
    const isSeverityIncreased = currentLevel > lastLevel;
    const reminderIntervalMs = this.config.alertReminderMinutes * 60 * 1000;
    const isReminderDue =
      currentLevel >= 2 && now - this.lastAlertTimestamp >= reminderIntervalMs;

    if (currentLevel >= 2 && (isSeverityIncreased || isReminderDue)) {
      const type = isReminderDue
        ? 'REMINDER_ALERT'
        : currentState === 'EMERGENCY'
          ? 'EMERGENCY_TRIGGERED'
          : currentState === 'CRITICAL'
            ? 'CRITICAL_TRIGGERED'
            : 'WARNING_TRIGGERED';

      const { consumptionRateMBPerMin, projectedMinutesToCritical } =
        this.calculateRatesAndTrends();

      this.addAuditEvent({
        id: `audit-alert-${now}`,
        timestamp: new Date().toISOString(),
        type,
        severity: currentState,
        message: `Memory pressure alert triggered: state is ${currentState}`,
        details: {
          hostAvailableBytes: latest?.hostAvailableBytes,
          hostAvailablePercent: latest?.hostAvailablePercent,
          browserHeapUsedBytes: latest?.browserHeapUsedBytes,
          browserHeapUsagePercent: latest?.browserHeapUsagePercent,
          declineRateMBPerMin: consumptionRateMBPerMin,
          projectedMinutesToCritical,
          videoElementCount: latest?.videoElementCount,
          iframeCount: latest?.iframeCount,
          canvasCount: latest?.canvasCount
        }
      });

      this.lastAlertSeverity = currentState;
      this.lastAlertTimestamp = now;
    } else if (currentLevel < 2) {
      this.lastAlertSeverity = currentState;
    }
  }

  public getMetricsSummary(): MemoryMetricsSummary {
    const latest = this.getLatestSample();
    const overallHealthState = this.getHealthState();
    const hostHealthState = this.getHostHealthState();
    const browserHeapHealthState = this.getBrowserHeapHealthState();
    const correlation = this.getCorrelationAnalysis();
    const browserHeap = this.getBrowserHeapMetrics();
    const resourceCounts = this.getResourceCounts();

    const {
      consumptionRateMBPerMin,
      trend1MinBytes,
      trend5MinBytes,
      trend15MinBytes,
      projectedMinutesToCritical
    } = this.calculateRatesAndTrends();

    return {
      latestSample: latest,
      healthState: overallHealthState,
      hostHealthState,
      browserHeapHealthState,
      overallHealthState,
      baselineState: this.getBaselineState(),
      leakSuspicion: correlation.leakSuspicion,
      suspicionReason: correlation.suspicionReason,
      availableRAMBytes: latest?.hostAvailableBytes ?? null,
      usedRAMBytes: latest?.hostUsedBytes ?? null,
      totalRAMBytes: latest?.hostTotalBytes ?? this.mockTotalRAMBytes,
      availableRAMPercent: latest?.hostAvailablePercent ?? null,
      hostMemorySourceApi: 'Node.js os.totalmem() / os.freemem() (/api/v1/system-memory)',
      browserHeapUsedBytes: latest?.browserHeapUsedBytes ?? null,
      browserHeapLimitBytes: latest?.browserHeapLimitBytes ?? null,
      browserHeap,
      resourceCounts,
      consumptionRateMBPerMin,
      trend1MinBytes,
      trend5MinBytes,
      trend15MinBytes,
      projectedMinutesToCritical,
      lastSampleTime: latest?.sampledAt ?? null,
      samples: [...this.samples],
      auditEvents: [...this.auditEvents],
      incidentTimeline: [...this.incidentTimeline],
      lastIncident: this.lastIncident,
      lastRecovery: this.lastRecovery,
      automaticDiagnosticSnapshot: this.automaticDiagnosticSnapshot,
      incidentHistory: [...this.incidentHistory]
    };
  }

  public getDiagnosticSnapshot(): MemoryDiagnosticSnapshot {
    const latest = this.getLatestSample();
    const summary = this.getMetricsSummary();

    const sysMem: SystemMemoryResponse = {
      totalBytes: this.mockTotalRAMBytes,
      usedBytes:
        latest?.hostUsedBytes ??
        this.mockTotalRAMBytes - (latest?.hostAvailableBytes ?? 0),
      availableBytes: latest?.hostAvailableBytes ?? 0,
      availablePercent: latest?.hostAvailablePercent ?? 0,
      commitUsedBytes: null,
      commitLimitBytes: null,
      swapUsedBytes: null,
      sampledAt: latest?.sampledAt ?? new Date().toISOString()
    };

    return {
      samples: [...this.samples],
      telemetryHealth: summary.healthState.toLowerCase(),
      adapterInstanceId: this.adapterInstanceId,
      subscriberCount: this.listeners.size,
      activeTransport: this.telemetrySource,
      resourceCounts: this.getResourceCounts(),
      currentStreamPath: this.currentStreamPath,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/Node',
      appVersion: '1.0.0',
      systemMemorySample: sysMem,
      auditEvents: [...this.auditEvents],
      incidentTimeline: [...this.incidentTimeline],
      browserHeapSummary: summary.browserHeap,
      capturedAt: new Date().toISOString()
    };
  }
}

let defaultMemoryServiceInstance: MemoryMonitorService | null = null;

export function getMemoryMonitorService(): MemoryMonitorService {
  if (!defaultMemoryServiceInstance) {
    defaultMemoryServiceInstance = new MemoryMonitorService();
    defaultMemoryServiceInstance.start();
  }
  return defaultMemoryServiceInstance;
}
