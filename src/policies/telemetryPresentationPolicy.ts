export interface TelemetryPresentationPolicyConfig {
  rawSampleIntervalMs: number;
  headerUpdateIntervalMs: number;
  headerDeadbandPercent: number;
  headerMinimumDeltaKbps: number;
  trendWindowSeconds: number;
}

export function getTelemetryPresentationPolicyConfig(): TelemetryPresentationPolicyConfig {
  const envInterval =
    typeof process !== 'undefined' ? process.env?.TELEMETRY_HEADER_UPDATE_INTERVAL_MS : undefined;
  const envDeadband =
    typeof process !== 'undefined' ? process.env?.TELEMETRY_HEADER_DEADBAND_PERCENT : undefined;
  const envMinDelta =
    typeof process !== 'undefined' ? process.env?.TELEMETRY_HEADER_MIN_DELTA_KBPS : undefined;
  const envTrendWindow =
    typeof process !== 'undefined' ? process.env?.TELEMETRY_TREND_WINDOW_SECONDS : undefined;

  return {
    rawSampleIntervalMs: 1000,
    headerUpdateIntervalMs: envInterval ? parseInt(envInterval, 10) : 3000,
    headerDeadbandPercent: envDeadband ? parseFloat(envDeadband) : 5,
    headerMinimumDeltaKbps: envMinDelta ? parseInt(envMinDelta, 10) : 200,
    trendWindowSeconds: envTrendWindow ? parseInt(envTrendWindow, 10) : 15,
  };
}

export type PresentationUpdateReason =
  | 'INITIAL_VALUE'
  | 'DEAD_BAND_EXCEEDED'
  | 'MINIMUM_DELTA_EXCEEDED'
  | 'SUSTAINED_CHANGE'
  | 'STATE_CHANGED'
  | 'OFFLINE_RESET'
  | 'STALE_RESET'
  | 'DEADBAND_HOLD'
  | 'SEQUENCE_OUT_OF_ORDER';

export interface HeaderPresentationInput {
  incomingSmoothedKbps: number | null;
  streamState: string; // e.g., 'LIVE', 'OFFLINE', 'WARMING_UP', 'STALE', 'BACKEND_OFFLINE', 'MEDIAMTX_OFFLINE'
  collectorSequence?: number;
  sampledAt?: string;
  nowMs?: number;
}

export interface HeaderPresentationResult {
  presentedHeaderBitrateKbps: number | null;
  updated: boolean;
  reason: PresentationUpdateReason;
  deltaKbps: number | null;
  deltaPercent: number | null;
}

export class HeaderPresentationPolicyEvaluator {
  private displayedKbps: number | null = null;
  private lastStreamState: string | null = null;
  private lastUpdateTimestampMs: number = 0;
  private lastCollectorSequence: number | undefined = undefined;
  private trendHistory: Array<{ timestampMs: number; valueKbps: number }> = [];

  constructor(private config: TelemetryPresentationPolicyConfig = getTelemetryPresentationPolicyConfig()) {}

  public getConfig(): TelemetryPresentationPolicyConfig {
    return { ...this.config };
  }

  public getDisplayedKbps(): number | null {
    return this.displayedKbps;
  }

  public evaluate(input: HeaderPresentationInput): HeaderPresentationResult {
    const nowMs = input.nowMs ?? Date.now();
    const config = this.config;

    // 1. Out of order sequence check
    if (
      input.collectorSequence !== undefined &&
      this.lastCollectorSequence !== undefined &&
      input.collectorSequence <= this.lastCollectorSequence
    ) {
      return {
        presentedHeaderBitrateKbps: this.displayedKbps,
        updated: false,
        reason: 'SEQUENCE_OUT_OF_ORDER',
        deltaKbps: null,
        deltaPercent: null,
      };
    }

    if (input.collectorSequence !== undefined) {
      this.lastCollectorSequence = input.collectorSequence;
    }

    const state = input.streamState;
    const incoming = input.incomingSmoothedKbps;

    // 2. Immediate reset for offline, error, stale states or null incoming bitrate
    const isOfflineState =
      state === 'OFFLINE' ||
      state === 'STALE' ||
      state === 'BACKEND_OFFLINE' ||
      state === 'MEDIAMTX_OFFLINE' ||
      incoming === null;

    if (isOfflineState) {
      const isStateChange = this.lastStreamState !== state;
      const wasNonNull = this.displayedKbps !== null;

      this.displayedKbps = null;
      this.lastStreamState = state;
      this.trendHistory = [];

      const reason: PresentationUpdateReason = state === 'STALE' ? 'STALE_RESET' : 'OFFLINE_RESET';

      if (wasNonNull || isStateChange) {
        this.logDebug(null, incoming, null, null, null, reason, input.collectorSequence, input.sampledAt);
        return {
          presentedHeaderBitrateKbps: null,
          updated: true,
          reason,
          deltaKbps: null,
          deltaPercent: null,
        };
      }

      return {
        presentedHeaderBitrateKbps: null,
        updated: false,
        reason,
        deltaKbps: null,
        deltaPercent: null,
      };
    }

    // 3. State transition (e.g. OFFLINE -> LIVE / WARMING_UP)
    const stateChanged = this.lastStreamState !== null && this.lastStreamState !== state;
    this.lastStreamState = state;

    if (stateChanged) {
      const prev = this.displayedKbps;
      this.displayedKbps = incoming;
      this.lastUpdateTimestampMs = nowMs;
      this.trendHistory = [{ timestampMs: nowMs, valueKbps: incoming }];

      this.logDebug(prev, incoming, incoming, 0, 0, 'STATE_CHANGED', input.collectorSequence, input.sampledAt);
      return {
        presentedHeaderBitrateKbps: incoming,
        updated: true,
        reason: 'STATE_CHANGED',
        deltaKbps: prev !== null ? Math.abs(incoming - prev) : null,
        deltaPercent: prev !== null && prev > 0 ? (Math.abs(incoming - prev) / prev) * 100 : null,
      };
    }

    // 4. Initial value when displayedKbps is null
    if (this.displayedKbps === null) {
      this.displayedKbps = incoming;
      this.lastUpdateTimestampMs = nowMs;
      this.trendHistory = [{ timestampMs: nowMs, valueKbps: incoming }];

      this.logDebug(null, incoming, incoming, 0, 0, 'INITIAL_VALUE', input.collectorSequence, input.sampledAt);
      return {
        presentedHeaderBitrateKbps: incoming,
        updated: true,
        reason: 'INITIAL_VALUE',
        deltaKbps: null,
        deltaPercent: null,
      };
    }

    // 5. Active stream calculations (displayedKbps is a non-null number)
    const prevDisplayed = this.displayedKbps;
    const deltaKbps = Math.abs(incoming - prevDisplayed);
    const deltaPercent = prevDisplayed > 0 ? (deltaKbps / prevDisplayed) * 100 : 100;

    // Record sample in trend window
    this.trendHistory.push({ timestampMs: nowMs, valueKbps: incoming });
    const cutoffMs = nowMs - config.trendWindowSeconds * 1000;
    this.trendHistory = this.trendHistory.filter((s) => s.timestampMs >= cutoffMs);

    let shouldUpdate = false;
    let updateReason: PresentationUpdateReason = 'DEADBAND_HOLD';

    // Condition A: Exceeds deadband percentage (e.g. 5%)
    if (deltaPercent >= config.headerDeadbandPercent) {
      shouldUpdate = true;
      updateReason = 'DEAD_BAND_EXCEEDED';
    }
    // Condition B: Exceeds minimum delta Kbps (e.g. 200 Kbps)
    else if (deltaKbps >= config.headerMinimumDeltaKbps) {
      shouldUpdate = true;
      updateReason = 'MINIMUM_DELTA_EXCEEDED';
    }
    // Condition C: Sustained change after headerUpdateIntervalMs (e.g. 3000ms)
    else if (nowMs - this.lastUpdateTimestampMs >= config.headerUpdateIntervalMs) {
      if (deltaKbps > 0) {
        shouldUpdate = true;
        updateReason = 'SUSTAINED_CHANGE';
      }
    }

    if (shouldUpdate) {
      this.displayedKbps = incoming;
      this.lastUpdateTimestampMs = nowMs;

      this.logDebug(
        prevDisplayed,
        incoming,
        incoming,
        deltaKbps,
        deltaPercent,
        updateReason,
        input.collectorSequence,
        input.sampledAt
      );

      return {
        presentedHeaderBitrateKbps: incoming,
        updated: true,
        reason: updateReason,
        deltaKbps,
        deltaPercent,
      };
    }

    return {
      presentedHeaderBitrateKbps: this.displayedKbps,
      updated: false,
      reason: 'DEADBAND_HOLD',
      deltaKbps,
      deltaPercent,
    };
  }

  public reset(): void {
    this.displayedKbps = null;
    this.lastStreamState = null;
    this.lastUpdateTimestampMs = 0;
    this.lastCollectorSequence = undefined;
    this.trendHistory = [];
  }

  private logDebug(
    previousDisplayedKbps: number | null,
    incomingSmoothedKbps: number | null,
    newDisplayedKbps: number | null,
    deltaKbps: number | null,
    deltaPercent: number | null,
    reason: PresentationUpdateReason,
    collectorSequence?: number,
    sampledAt?: string
  ) {
    const isDebug =
      (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') ||
      (typeof window !== 'undefined' && Boolean((window as any).TELEMETRY_DEBUG));

    if (isDebug) {
      console.log('[TELEMETRY_DEBUG Header Presentation Change]', {
        previousDisplayedKbps,
        incomingSmoothedKbps,
        newDisplayedKbps,
        deltaKbps: deltaKbps !== null ? Math.round(deltaKbps) : null,
        deltaPercent: deltaPercent !== null ? Number(deltaPercent.toFixed(2)) : null,
        reason,
        collectorSequence,
        sampledAt: sampledAt || new Date().toISOString(),
      });
    }
  }
}

// Requirement 10: Real Test Readiness
export interface RealTestReadinessInput {
  isMockMode: boolean;
  backendReachable: boolean;
  mediaMtxReachable: boolean;
  lastUpdateAgeMs: number | null;
  activeCollectorCount: number;
  headerSubscriptionActive: boolean;
  duplicateSnapshotDetected: boolean;
}

export interface RealTestReadinessResult {
  isReady: boolean;
  statusLabel: string;
  blockingReasons: string[];
}

export function evaluateRealTestReadiness(input: RealTestReadinessInput): RealTestReadinessResult {
  const blockingReasons: string[] = [];

  if (input.isMockMode) {
    blockingReasons.push('Mock Mode Active');
  }
  if (!input.backendReachable) {
    blockingReasons.push('Backend Unreachable');
  }
  if (!input.mediaMtxReachable) {
    blockingReasons.push('MediaMTX API Unreachable');
  }
  if (input.lastUpdateAgeMs === null || input.lastUpdateAgeMs >= 10000) {
    blockingReasons.push('Telemetry Snapshot Stale');
  }
  if (input.activeCollectorCount !== 1) {
    blockingReasons.push(`Collector Count (${input.activeCollectorCount}) !== 1`);
  }
  if (!input.headerSubscriptionActive) {
    blockingReasons.push('Header Subscription Inactive');
  }
  if (input.duplicateSnapshotDetected) {
    blockingReasons.push('Duplicate Snapshot Processing Detected');
  }

  const isReady = blockingReasons.length === 0;
  return {
    isReady,
    statusLabel: isReady ? 'REAL TEST READY' : `NOT READY: ${blockingReasons[0]}`,
    blockingReasons,
  };
}
