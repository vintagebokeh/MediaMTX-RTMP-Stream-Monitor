import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  HeaderPresentationPolicyEvaluator,
  getTelemetryPresentationPolicyConfig,
  evaluateRealTestReadiness,
} from './telemetryPresentationPolicy';

describe('Telemetry Presentation Policy V0.1 Tests', () => {
  it('reads default configuration values and handles env overrides', () => {
    const defaultConfig = getTelemetryPresentationPolicyConfig();
    assert.strictEqual(defaultConfig.rawSampleIntervalMs, 1000);
    assert.strictEqual(defaultConfig.headerUpdateIntervalMs, 3000);
    assert.strictEqual(defaultConfig.headerDeadbandPercent, 5);
    assert.strictEqual(defaultConfig.headerMinimumDeltaKbps, 200);
    assert.strictEqual(defaultConfig.trendWindowSeconds, 15);

    process.env.TELEMETRY_HEADER_UPDATE_INTERVAL_MS = '5000';
    process.env.TELEMETRY_HEADER_DEADBAND_PERCENT = '10';
    process.env.TELEMETRY_HEADER_MIN_DELTA_KBPS = '500';
    process.env.TELEMETRY_TREND_WINDOW_SECONDS = '30';

    const customConfig = getTelemetryPresentationPolicyConfig();
    assert.strictEqual(customConfig.headerUpdateIntervalMs, 5000);
    assert.strictEqual(customConfig.headerDeadbandPercent, 10);
    assert.strictEqual(customConfig.headerMinimumDeltaKbps, 500);
    assert.strictEqual(customConfig.trendWindowSeconds, 30);

    delete process.env.TELEMETRY_HEADER_UPDATE_INTERVAL_MS;
    delete process.env.TELEMETRY_HEADER_DEADBAND_PERCENT;
    delete process.env.TELEMETRY_HEADER_MIN_DELTA_KBPS;
    delete process.env.TELEMETRY_TREND_WINDOW_SECONDS;
  });

  it('sets initial value on first live sample', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator({
      rawSampleIntervalMs: 1000,
      headerUpdateIntervalMs: 3000,
      headerDeadbandPercent: 5,
      headerMinimumDeltaKbps: 200,
      trendWindowSeconds: 15,
    });

    const now = 1000000;
    const res = evaluator.evaluate({
      incomingSmoothedKbps: 6000,
      streamState: 'LIVE',
      collectorSequence: 1,
      nowMs: now,
    });

    assert.strictEqual(res.presentedHeaderBitrateKbps, 6000);
    assert.strictEqual(res.updated, true);
    assert.strictEqual(res.reason, 'INITIAL_VALUE');
  });

  it('holds value when small fluctuation is inside deadband (< 5% and < 200 Kbps)', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator({
      rawSampleIntervalMs: 1000,
      headerUpdateIntervalMs: 3000,
      headerDeadbandPercent: 5,
      headerMinimumDeltaKbps: 200,
      trendWindowSeconds: 15,
    });

    const now = 1000000;
    evaluator.evaluate({
      incomingSmoothedKbps: 6000,
      streamState: 'LIVE',
      collectorSequence: 1,
      nowMs: now,
    });

    // 6050 is +50 Kbps (+0.83%), well under 5% (300 Kbps) and under 200 Kbps minimum delta
    const res2 = evaluator.evaluate({
      incomingSmoothedKbps: 6050,
      streamState: 'LIVE',
      collectorSequence: 2,
      nowMs: now + 1000,
    });

    assert.strictEqual(res2.presentedHeaderBitrateKbps, 6000);
    assert.strictEqual(res2.updated, false);
    assert.strictEqual(res2.reason, 'DEADBAND_HOLD');
  });

  it('updates when change exceeds deadband percentage (e.g. >= 5%)', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator({
      rawSampleIntervalMs: 1000,
      headerUpdateIntervalMs: 3000,
      headerDeadbandPercent: 5,
      headerMinimumDeltaKbps: 500, // higher minimum delta so deadband triggers first
      trendWindowSeconds: 15,
    });

    const now = 1000000;
    evaluator.evaluate({
      incomingSmoothedKbps: 6000,
      streamState: 'LIVE',
      collectorSequence: 1,
      nowMs: now,
    });

    // 6360 is +360 Kbps (+6.0%), which exceeds 5%
    const res = evaluator.evaluate({
      incomingSmoothedKbps: 6360,
      streamState: 'LIVE',
      collectorSequence: 2,
      nowMs: now + 1000,
    });

    assert.strictEqual(res.presentedHeaderBitrateKbps, 6360);
    assert.strictEqual(res.updated, true);
    assert.strictEqual(res.reason, 'DEAD_BAND_EXCEEDED');
  });

  it('updates when change exceeds minimum delta Kbps (e.g. >= 200 Kbps)', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator({
      rawSampleIntervalMs: 1000,
      headerUpdateIntervalMs: 3000,
      headerDeadbandPercent: 10, // higher deadband % so min delta triggers first
      headerMinimumDeltaKbps: 200,
      trendWindowSeconds: 15,
    });

    const now = 1000000;
    evaluator.evaluate({
      incomingSmoothedKbps: 3000,
      streamState: 'LIVE',
      collectorSequence: 1,
      nowMs: now,
    });

    // +250 Kbps is 8.33% (< 10%), but >= 200 Kbps minimum delta
    const res = evaluator.evaluate({
      incomingSmoothedKbps: 3250,
      streamState: 'LIVE',
      collectorSequence: 2,
      nowMs: now + 1000,
    });

    assert.strictEqual(res.presentedHeaderBitrateKbps, 3250);
    assert.strictEqual(res.updated, true);
    assert.strictEqual(res.reason, 'MINIMUM_DELTA_EXCEEDED');
  });

  it('updates sustained change after update interval has elapsed', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator({
      rawSampleIntervalMs: 1000,
      headerUpdateIntervalMs: 3000,
      headerDeadbandPercent: 10,
      headerMinimumDeltaKbps: 500,
      trendWindowSeconds: 15,
    });

    const now = 1000000;
    evaluator.evaluate({
      incomingSmoothedKbps: 6000,
      streamState: 'LIVE',
      collectorSequence: 1,
      nowMs: now,
    });

    // Small change (+100 Kbps), hold at t+1s and t+2s
    evaluator.evaluate({
      incomingSmoothedKbps: 6100,
      streamState: 'LIVE',
      collectorSequence: 2,
      nowMs: now + 1000,
    });

    evaluator.evaluate({
      incomingSmoothedKbps: 6100,
      streamState: 'LIVE',
      collectorSequence: 3,
      nowMs: now + 2000,
    });

    // At t+3000ms (>= 3000ms headerUpdateIntervalMs), sustained change updates!
    const resSustained = evaluator.evaluate({
      incomingSmoothedKbps: 6100,
      streamState: 'LIVE',
      collectorSequence: 4,
      nowMs: now + 3000,
    });

    assert.strictEqual(resSustained.presentedHeaderBitrateKbps, 6100);
    assert.strictEqual(resSustained.updated, true);
    assert.strictEqual(resSustained.reason, 'SUSTAINED_CHANGE');
  });

  it('immediately resets displayed bitrate to null on OFFLINE state', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator();
    const now = 1000000;

    evaluator.evaluate({
      incomingSmoothedKbps: 6000,
      streamState: 'LIVE',
      collectorSequence: 1,
      nowMs: now,
    });

    const resOffline = evaluator.evaluate({
      incomingSmoothedKbps: 0,
      streamState: 'OFFLINE',
      collectorSequence: 2,
      nowMs: now + 1000,
    });

    assert.strictEqual(resOffline.presentedHeaderBitrateKbps, null);
    assert.strictEqual(resOffline.updated, true);
    assert.strictEqual(resOffline.reason, 'OFFLINE_RESET');
  });

  it('immediately updates displayed bitrate on LIVE transition after OFFLINE', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator();
    const now = 1000000;

    evaluator.evaluate({
      incomingSmoothedKbps: null,
      streamState: 'OFFLINE',
      collectorSequence: 1,
      nowMs: now,
    });

    const resLive = evaluator.evaluate({
      incomingSmoothedKbps: 6000,
      streamState: 'LIVE',
      collectorSequence: 2,
      nowMs: now + 1000,
    });

    assert.strictEqual(resLive.presentedHeaderBitrateKbps, 6000);
    assert.strictEqual(resLive.updated, true);
    assert.strictEqual(resLive.reason, 'STATE_CHANGED');
  });

  it('ignores older or duplicate collectorSequence', () => {
    const evaluator = new HeaderPresentationPolicyEvaluator();
    const now = 1000000;

    evaluator.evaluate({
      incomingSmoothedKbps: 6000,
      streamState: 'LIVE',
      collectorSequence: 10,
      nowMs: now,
    });

    // Sequence 5 is older than 10
    const resStaleSeq = evaluator.evaluate({
      incomingSmoothedKbps: 8000,
      streamState: 'LIVE',
      collectorSequence: 5,
      nowMs: now + 1000,
    });

    assert.strictEqual(resStaleSeq.presentedHeaderBitrateKbps, 6000);
    assert.strictEqual(resStaleSeq.updated, false);
    assert.strictEqual(resStaleSeq.reason, 'SEQUENCE_OUT_OF_ORDER');
  });

  it('evaluates Real Test Readiness diagnostic criteria correctly', () => {
    const readyResult = evaluateRealTestReadiness({
      isMockMode: false,
      backendReachable: true,
      mediaMtxReachable: true,
      lastUpdateAgeMs: 500,
      activeCollectorCount: 1,
      headerSubscriptionActive: true,
      duplicateSnapshotDetected: false,
    });

    assert.strictEqual(readyResult.isReady, true);
    assert.strictEqual(readyResult.statusLabel, 'REAL TEST READY');
    assert.strictEqual(readyResult.blockingReasons.length, 0);

    const mockResult = evaluateRealTestReadiness({
      isMockMode: true,
      backendReachable: true,
      mediaMtxReachable: true,
      lastUpdateAgeMs: 500,
      activeCollectorCount: 1,
      headerSubscriptionActive: true,
      duplicateSnapshotDetected: false,
    });

    assert.strictEqual(mockResult.isReady, false);
    assert.strictEqual(mockResult.statusLabel, 'NOT READY: Mock Mode Active');
  });
});
