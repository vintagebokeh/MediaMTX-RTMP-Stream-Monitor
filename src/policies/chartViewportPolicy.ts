export type TimeRangeOption = '30s' | '1m' | '5m' | '15m' | '1h' | '3h' | 'all';
export type YScaleMode = 'auto' | 'target' | 'manual';

export interface ChartViewportState {
  timeRange: TimeRangeOption;
  yScaleMode: YScaleMode;
  yMinKbps: number | null;
  yMaxKbps: number | null;
  viewportStart: number | null;
  viewportEnd: number | null;
}

export const DEFAULT_VIEWPORT_STATE: ChartViewportState = {
  timeRange: '1m',
  yScaleMode: 'auto',
  yMinKbps: null,
  yMaxKbps: null,
  viewportStart: null,
  viewportEnd: null,
};

export interface ChartPointInput {
  time: string;
  timestampMs?: number;
  bitrateKbps: number | null;
  instantBitrateKbps?: number | null;
  averageBitrateKbps60s?: number | null;
  targetKbps: number | null;
  latencyMs: number | null;
  inboundErrors: number;
  discardedFrames: number;
}

export interface AggregatedBucket {
  time: string;
  timestampMs: number;
  startTimeMs: number;
  endTimeMs: number;
  minKbps: number | null;
  maxKbps: number | null;
  avgKbps: number | null;
  bitrateKbps: number | null; // Primary line uses avgKbps (or bitrateKbps)
  lastKbps: number | null;
  instantBitrateKbps: number | null;
  averageBitrateKbps60s: number | null;
  targetKbps: number | null;
  latencyMs: number | null;
  inboundErrors: number;
  discardedFrames: number;
  sampleCount: number;
  hasNull: boolean;
}

export interface YAxisDomainResult {
  domain: [number, number];
  isTargetOutside: boolean;
  targetIndicatorDirection: 'above' | 'below' | null;
}

export function getTimeRangeSeconds(timeRange: TimeRangeOption): number | null {
  switch (timeRange) {
    case '30s':
      return 30;
    case '1m':
      return 60;
    case '5m':
      return 300;
    case '15m':
      return 900;
    case '1h':
      return 3600;
    case '3h':
      return 10800;
    case 'all':
      return null;
  }
}

export function getBucketIntervalSeconds(timeRange: TimeRangeOption): number {
  switch (timeRange) {
    case '30s':
    case '1m':
      return 1;
    case '5m':
      return 3;
    case '15m':
      return 10;
    case '1h':
      return 30;
    case '3h':
    case 'all':
      return 60;
  }
}

/**
 * Filter raw chart history by time range or explicit viewport timestamps without mutating original history.
 */
export function filterHistoryByTimeRange(
  history: ChartPointInput[],
  viewport: ChartViewportState,
  referenceNowMs?: number
): { filtered: ChartPointInput[]; startTs: number | null; endTs: number | null } {
  if (!history || history.length === 0) {
    return { filtered: [], startTs: null, endTs: null };
  }

  // Attach/resolve timestamps on history points
  const latestPointTs = history[history.length - 1].timestampMs ?? Date.now();
  const baseNowMs = referenceNowMs ?? latestPointTs;

  // Assign timestamps if missing
  const pointsWithTs = history.map((p, idx) => {
    let ts = p.timestampMs;
    if (ts === undefined) {
      // Try parsing p.time or compute relative to latestPointTs
      const parsed = Date.parse(p.time);
      if (!isNaN(parsed)) {
        ts = parsed;
      } else {
        // Fallback assuming 1-second interval leading up to baseNowMs
        ts = baseNowMs - (history.length - 1 - idx) * 1000;
      }
    }
    return { point: p, ts };
  });

  let startTs: number | null = null;
  let endTs: number | null = null;

  if (viewport.viewportStart !== null && viewport.viewportEnd !== null) {
    startTs = viewport.viewportStart;
    endTs = viewport.viewportEnd;
  } else {
    const rangeSec = getTimeRangeSeconds(viewport.timeRange);
    if (rangeSec !== null) {
      startTs = baseNowMs - rangeSec * 1000;
      endTs = baseNowMs;
    }
  }

  const filtered = pointsWithTs
    .filter(({ ts }) => {
      if (startTs !== null && ts < startTs) return false;
      if (endTs !== null && ts > endTs) return false;
      return true;
    })
    .map(({ point }) => point);

  return { filtered, startTs, endTs };
}

/**
 * Aggregates raw history points into bounded buckets for chart performance and incident retention.
 */
export function aggregateHistoryBuckets(
  filteredPoints: ChartPointInput[],
  timeRange: TimeRangeOption
): AggregatedBucket[] {
  if (!filteredPoints || filteredPoints.length === 0) {
    return [];
  }

  const bucketIntervalSec = getBucketIntervalSeconds(timeRange);
  const bucketIntervalMs = bucketIntervalSec * 1000;

  // For 1-second buckets (e.g. 30s or 1m views), pass through directly to preserve full resolution
  if (bucketIntervalSec <= 1) {
    return filteredPoints.map((p) => {
      const ts = p.timestampMs ?? Date.now();
      return {
        time: p.time,
        timestampMs: ts,
        startTimeMs: ts,
        endTimeMs: ts + 1000,
        minKbps: p.bitrateKbps,
        maxKbps: p.bitrateKbps,
        avgKbps: p.bitrateKbps,
        bitrateKbps: p.bitrateKbps,
        lastKbps: p.bitrateKbps,
        instantBitrateKbps: p.instantBitrateKbps ?? null,
        averageBitrateKbps60s: p.averageBitrateKbps60s ?? null,
        targetKbps: p.targetKbps ?? 6000,
        latencyMs: p.latencyMs,
        inboundErrors: p.inboundErrors,
        discardedFrames: p.discardedFrames,
        sampleCount: 1,
        hasNull: p.bitrateKbps === null || p.bitrateKbps === 0,
      };
    });
  }

  // Group into time buckets
  const firstTs = filteredPoints[0].timestampMs ?? Date.now();
  const bucketsMap = new Map<number, ChartPointInput[]>();

  for (const point of filteredPoints) {
    const ts = point.timestampMs ?? firstTs;
    const bucketIndex = Math.floor((ts - firstTs) / bucketIntervalMs);
    const bucketKey = firstTs + bucketIndex * bucketIntervalMs;

    if (!bucketsMap.has(bucketKey)) {
      bucketsMap.set(bucketKey, []);
    }
    bucketsMap.get(bucketKey)!.push(point);
  }

  const result: AggregatedBucket[] = [];

  for (const [bucketStart, points] of bucketsMap.entries()) {
    const bucketEnd = bucketStart + bucketIntervalMs;
    const sampleCount = points.length;

    let hasNull = false;
    const nonNullBitrates: number[] = [];
    const nonNullInstants: number[] = [];
    let sumErrors = 0;
    let maxDiscarded = 0;
    let lastLatency: number | null = null;
    let lastTarget: number = 6000;
    let last60sAvg: number | null = null;

    for (const p of points) {
      if (p.bitrateKbps === null || p.bitrateKbps === 0) {
        hasNull = true;
      }
      if (p.bitrateKbps !== null) {
        nonNullBitrates.push(p.bitrateKbps);
      }
      if (p.instantBitrateKbps !== undefined && p.instantBitrateKbps !== null) {
        nonNullInstants.push(p.instantBitrateKbps);
      }
      if (p.inboundErrors) sumErrors += p.inboundErrors;
      if (p.discardedFrames > maxDiscarded) maxDiscarded = p.discardedFrames;
      if (p.latencyMs !== null) lastLatency = p.latencyMs;
      if (p.targetKbps !== null) lastTarget = p.targetKbps;
      if (p.averageBitrateKbps60s !== undefined && p.averageBitrateKbps60s !== null) {
        last60sAvg = p.averageBitrateKbps60s;
      }
    }

    let minKbps: number | null = null;
    let maxKbps: number | null = null;
    let avgKbps: number | null = null;
    let lastKbps: number | null = null;

    if (nonNullBitrates.length > 0) {
      minKbps = Math.min(...nonNullBitrates);
      maxKbps = Math.max(...nonNullBitrates);
      const sum = nonNullBitrates.reduce((a, b) => a + b, 0);
      avgKbps = Math.round(sum / nonNullBitrates.length);
      lastKbps = nonNullBitrates[nonNullBitrates.length - 1];
    }

    // If ALL samples in bucket were null, bucket bitrate is null (connectNulls={false} shows gap)
    // If SOME samples were null, avgKbps retains average while minKbps retains the 0/null drop
    const bitrateKbps = nonNullBitrates.length === 0 ? null : avgKbps;

    let instantBitrateKbps: number | null = null;
    if (nonNullInstants.length > 0) {
      instantBitrateKbps = Math.round(
        nonNullInstants.reduce((a, b) => a + b, 0) / nonNullInstants.length
      );
    }

    const formattedTime = new Date(bucketStart).toLocaleTimeString();

    result.push({
      time: formattedTime,
      timestampMs: bucketStart,
      startTimeMs: bucketStart,
      endTimeMs: bucketEnd,
      minKbps,
      maxKbps,
      avgKbps,
      bitrateKbps,
      lastKbps,
      instantBitrateKbps,
      averageBitrateKbps60s: last60sAvg,
      targetKbps: lastTarget,
      latencyMs: lastLatency,
      inboundErrors: sumErrors,
      discardedFrames: maxDiscarded,
      sampleCount,
      hasNull,
    });
  }

  return result;
}

/**
 * Calculates Y-axis viewport domain with padding and checks if configured target is outside the viewport.
 */
export function calculateYAxisBounds(
  visibleData: Array<{ bitrateKbps: number | null; minKbps?: number | null; maxKbps?: number | null; instantBitrateKbps?: number | null }>,
  yScaleMode: YScaleMode,
  configuredTargetKbps: number = 6000,
  manualMin: number | null = null,
  manualMax: number | null = null
): YAxisDomainResult {
  if (yScaleMode === 'manual' && manualMin !== null && manualMax !== null && manualMin >= 0 && manualMax > manualMin) {
    const isTargetOutside = configuredTargetKbps > manualMax || configuredTargetKbps < manualMin;
    let targetIndicatorDirection: 'above' | 'below' | null = null;
    if (configuredTargetKbps > manualMax) targetIndicatorDirection = 'above';
    if (configuredTargetKbps < manualMin) targetIndicatorDirection = 'below';

    return {
      domain: [manualMin, manualMax],
      isTargetOutside,
      targetIndicatorDirection,
    };
  }

  if (yScaleMode === 'target') {
    const defaultMax = Math.round(configuredTargetKbps * 1.1);
    let yMax = defaultMax;

    // Expand max if visible data exceeds target default max
    for (const d of visibleData) {
      const vals = [d.bitrateKbps, d.maxKbps, d.instantBitrateKbps].filter(
        (v): v is number => v !== null && v !== undefined
      );
      for (const v of vals) {
        if (v > yMax) {
          yMax = Math.ceil(v * 1.08); // expand safely
        }
      }
    }

    return {
      domain: [0, yMax],
      isTargetOutside: false,
      targetIndicatorDirection: null,
    };
  }

  // AUTO Mode: Calculate viewport bounds from visible measured data with ~10% padding
  const validValues: number[] = [];
  for (const d of visibleData) {
    if (d.bitrateKbps !== null && d.bitrateKbps !== undefined) validValues.push(d.bitrateKbps);
    if (d.minKbps !== null && d.minKbps !== undefined) validValues.push(d.minKbps);
    if (d.maxKbps !== null && d.maxKbps !== undefined) validValues.push(d.maxKbps);
  }

  if (validValues.length === 0) {
    const defaultMax = Math.ceil(configuredTargetKbps * 1.1);
    return {
      domain: [0, defaultMax],
      isTargetOutside: false,
      targetIndicatorDirection: null,
    };
  }

  const visibleMin = Math.min(...validValues);
  const visibleMax = Math.max(...validValues);

  let yMin: number;
  let yMax: number;

  if (visibleMin === visibleMax) {
    const pad = Math.max(Math.round(visibleMin * 0.1), 500);
    yMin = Math.max(0, visibleMin - pad);
    yMax = visibleMax + pad;
  } else {
    const diff = visibleMax - visibleMin;
    const pad = Math.max(Math.round(diff * 0.1), 50);
    yMin = Math.max(0, visibleMin - pad);
    yMax = visibleMax + pad;
  }

  const isTargetOutside = configuredTargetKbps > yMax || configuredTargetKbps < yMin;
  let targetIndicatorDirection: 'above' | 'below' | null = null;
  if (configuredTargetKbps > yMax) targetIndicatorDirection = 'above';
  if (configuredTargetKbps < yMin) targetIndicatorDirection = 'below';

  return {
    domain: [yMin, yMax],
    isTargetOutside,
    targetIndicatorDirection,
  };
}

/**
 * Validates manual Y axis inputs
 */
export function validateManualYBounds(min: number | null, max: number | null): { isValid: boolean; errorMessage?: string } {
  if (min === null || max === null) {
    return { isValid: false, errorMessage: 'Min and Max values are required' };
  }
  if (isNaN(min) || isNaN(max)) {
    return { isValid: false, errorMessage: 'Min and Max must be numeric' };
  }
  if (min < 0) {
    return { isValid: false, errorMessage: 'Minimum Kbps must be >= 0' };
  }
  if (max <= min) {
    return { isValid: false, errorMessage: 'Maximum Kbps must be greater than Minimum' };
  }
  return { isValid: true };
}
