import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ChartViewportState,
  DEFAULT_VIEWPORT_STATE,
  ChartPointInput,
  filterHistoryByTimeRange,
  aggregateHistoryBuckets,
  calculateYAxisBounds,
  validateManualYBounds,
} from './chartViewportPolicy';

describe('Telemetry Chart Viewport & Time-Scale V0.1 Tests', () => {
  const mockNow = 1700000000000;

  // Helper to generate N samples 1s apart leading up to mockNow
  function generateSamples(count: number, bitrateKbps: number | null = 6000): ChartPointInput[] {
    const samples: ChartPointInput[] = [];
    for (let i = 0; i < count; i++) {
      const ts = mockNow - (count - 1 - i) * 1000;
      samples.push({
        time: new Date(ts).toLocaleTimeString(),
        timestampMs: ts,
        bitrateKbps,
        instantBitrateKbps: bitrateKbps !== null ? bitrateKbps + 100 : null,
        averageBitrateKbps60s: bitrateKbps,
        targetKbps: 6000,
        latencyMs: 2000,
        inboundErrors: 0,
        discardedFrames: 0,
      });
    }
    return samples;
  }

  it('1. Filters X time-range accurately (30s, 1m, 5m, all)', () => {
    // 300 samples = 5 minutes of data
    const history = generateSamples(300, 6000);

    // 30s filter
    const vp30s: ChartViewportState = { ...DEFAULT_VIEWPORT_STATE, timeRange: '30s' };
    const { filtered: f30s } = filterHistoryByTimeRange(history, vp30s, mockNow);
    assert.strictEqual(f30s.length, 31); // 30 seconds span inclusive of endpoints

    // 1m filter
    const vp1m: ChartViewportState = { ...DEFAULT_VIEWPORT_STATE, timeRange: '1m' };
    const { filtered: f1m } = filterHistoryByTimeRange(history, vp1m, mockNow);
    assert.strictEqual(f1m.length, 61);

    // All filter
    const vpAll: ChartViewportState = { ...DEFAULT_VIEWPORT_STATE, timeRange: 'all' };
    const { filtered: fAll } = filterHistoryByTimeRange(history, vpAll, mockNow);
    assert.strictEqual(fAll.length, 300);
  });

  it('2. Calculates AUTO Y range with visual padding from visible values', () => {
    const data = [
      { bitrateKbps: 3900 },
      { bitrateKbps: 4000 },
      { bitrateKbps: 4200 },
    ];

    const res = calculateYAxisBounds(data, 'auto', 6000);
    // Range min=3900, max=4200. Diff=300. Padding = max(300 * 0.1, 50) = 50.
    assert.strictEqual(res.domain[0], 3850); // 3900 - 50
    assert.strictEqual(res.domain[1], 4250); // 4200 + 50
    assert.strictEqual(res.isTargetOutside, true);
    assert.strictEqual(res.targetIndicatorDirection, 'above');
  });

  it('3. Target Y mode sets default range (0 to target * 1.1)', () => {
    const data = [{ bitrateKbps: 5800 }, { bitrateKbps: 6100 }];
    const res = calculateYAxisBounds(data, 'target', 6000);

    assert.strictEqual(res.domain[0], 0);
    assert.strictEqual(res.domain[1], 6600); // 6000 * 1.1
    assert.strictEqual(res.isTargetOutside, false);
  });

  it('4. Expands Target Y mode safely when measured data exceeds target default', () => {
    // Spike to 8000 Kbps (exceeds 6600 default max)
    const data = [{ bitrateKbps: 6000 }, { bitrateKbps: 8000 }];
    const res = calculateYAxisBounds(data, 'target', 6000);

    assert.strictEqual(res.domain[0], 0);
    assert.ok(res.domain[1] >= 8000, `Expected domain max to expand past 8000, got ${res.domain[1]}`);
    assert.strictEqual(res.isTargetOutside, false);
  });

  it('5. Validates manual Y bounds inputs', () => {
    const v1 = validateManualYBounds(0, 10000);
    assert.strictEqual(v1.isValid, true);

    const v2 = validateManualYBounds(-100, 5000);
    assert.strictEqual(v2.isValid, false);
    assert.ok(v2.errorMessage?.includes('>= 0'));

    const v3 = validateManualYBounds(6000, 3000);
    assert.strictEqual(v3.isValid, false);
    assert.ok(v3.errorMessage?.includes('greater than'));
  });

  it('6. Detects target indicator status when target is outside manual viewport', () => {
    const data = [{ bitrateKbps: 3000 }];
    const resAbove = calculateYAxisBounds(data, 'manual', 6000, 1000, 4000);

    assert.strictEqual(resAbove.isTargetOutside, true);
    assert.strictEqual(resAbove.targetIndicatorDirection, 'above');

    const resBelow = calculateYAxisBounds(data, 'manual', 2000, 3000, 8000);
    assert.strictEqual(resBelow.isTargetOutside, true);
    assert.strictEqual(resBelow.targetIndicatorDirection, 'below');
  });

  it('7. Aggregates history buckets retaining min, max, avg, and last Kbps', () => {
    const history: ChartPointInput[] = [
      { time: '10:00:00', timestampMs: 1000000, bitrateKbps: 5000, targetKbps: 6000, latencyMs: 2000, inboundErrors: 0, discardedFrames: 0 },
      { time: '10:00:01', timestampMs: 1000001, bitrateKbps: 6000, targetKbps: 6000, latencyMs: 2000, inboundErrors: 0, discardedFrames: 0 },
      { time: '10:00:02', timestampMs: 1000002, bitrateKbps: 7000, targetKbps: 6000, latencyMs: 2000, inboundErrors: 0, discardedFrames: 0 },
    ];

    // Force aggregation by using '5m' window (3s buckets)
    const buckets = aggregateHistoryBuckets(history, '5m');
    assert.strictEqual(buckets.length, 1);

    const b = buckets[0];
    assert.strictEqual(b.minKbps, 5000);
    assert.strictEqual(b.maxKbps, 7000);
    assert.strictEqual(b.avgKbps, 6000);
    assert.strictEqual(b.lastKbps, 7000);
    assert.strictEqual(b.sampleCount, 3);
  });

  it('8. Retains short zero/null drops during downsampling and does not hide them', () => {
    const history: ChartPointInput[] = [
      { time: '10:00:00', timestampMs: 1000000, bitrateKbps: 6000, targetKbps: 6000, latencyMs: 2000, inboundErrors: 0, discardedFrames: 0 },
      { time: '10:00:01', timestampMs: 1000001, bitrateKbps: 0, targetKbps: 6000, latencyMs: 2000, inboundErrors: 0, discardedFrames: 0 }, // drop!
      { time: '10:00:02', timestampMs: 1000002, bitrateKbps: 6000, targetKbps: 6000, latencyMs: 2000, inboundErrors: 0, discardedFrames: 0 },
    ];

    const buckets = aggregateHistoryBuckets(history, '5m');
    assert.strictEqual(buckets.length, 1);

    const b = buckets[0];
    assert.strictEqual(b.minKbps, 0); // Drop is recorded in minKbps
    assert.strictEqual(b.hasNull, true); // Drop flagged on bucket
    assert.strictEqual(b.avgKbps, 4000); // Average reflects the drop
  });

  it('9. Preserves raw offline gaps as null when entire bucket is offline', () => {
    const history: ChartPointInput[] = [
      { time: '10:00:00', timestampMs: 1000000, bitrateKbps: null, targetKbps: 6000, latencyMs: null, inboundErrors: 0, discardedFrames: 0 },
      { time: '10:00:01', timestampMs: 1000001, bitrateKbps: null, targetKbps: 6000, latencyMs: null, inboundErrors: 0, discardedFrames: 0 },
    ];

    const buckets = aggregateHistoryBuckets(history, '1m');
    assert.strictEqual(buckets[0].bitrateKbps, null);
    assert.strictEqual(buckets[0].minKbps, null);
    assert.strictEqual(buckets[0].hasNull, true);
  });

  it('10. Changing viewport state does not mutate raw source history', () => {
    const history = generateSamples(50, 6000);
    const originalCopy = JSON.stringify(history);

    const vp1: ChartViewportState = { ...DEFAULT_VIEWPORT_STATE, timeRange: '30s', yScaleMode: 'manual', yMinKbps: 1000, yMaxKbps: 5000 };
    const { filtered } = filterHistoryByTimeRange(history, vp1, mockNow);
    aggregateHistoryBuckets(filtered, '30s');

    // Ensure raw history object array is unchanged
    assert.strictEqual(JSON.stringify(history), originalCopy);
  });
});
