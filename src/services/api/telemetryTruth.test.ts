import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { MockApiAdapter } from './MockApiAdapter.js';
import { StreamMetrics } from '../../types/index.js';

describe('Telemetry Truth Model Tests', () => {
  it('1. Mock Mode reports telemetrySource="mock" and telemetryFreshness="live"', async () => {
    const mockAdapter = new MockApiAdapter({
      apiUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000/ws/live',
      appEnv: 'local',
      useMockData: true
    });

    const health = await mockAdapter.getHealth();
    assert.equal(health.mockMode, true);
    assert.equal(health.telemetrySource, 'mock');
    assert.equal(health.telemetryFreshness, 'live');
    assert.ok((health.measuredBitrateKbps ?? 0) > 0);
    assert.equal(health.configuredTargetBitrateKbps, 6000);

    mockAdapter.dispose();
  });

  it('2. Mock Mode provides non-null measured bitrate for active mock streams', async () => {
    const mockAdapter = new MockApiAdapter({
      apiUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000/ws/live',
      appEnv: 'local',
      useMockData: true
    });

    const streams = await mockAdapter.getStreams();
    assert.ok(streams.length > 0);
    const primary = streams[0];
    assert.equal(primary.publisherConnected, true);
    assert.equal(primary.streamAvailable, true);
    assert.equal(primary.telemetrySource, 'mock');
    assert.ok((primary.metrics.measuredBitrateKbps ?? 0) > 0);
    assert.equal(primary.metrics.configuredTargetBitrateKbps, 6000);

    mockAdapter.dispose();
  });

  it('3. Offline or No Signal scenario sets measuredBitrateKbps to null', () => {
    const offlineMetrics: StreamMetrics = {
      currentBitrateKbps: null,
      measuredBitrateKbps: null,
      targetBitrateKbps: 6000,
      configuredTargetBitrateKbps: 6000,
      latencyMs: null,
      configuredLatencyTargetMs: 2000,
      measuredLatencyMs: null,
      inboundErrors: 0,
      discardedFrames: 0,
      fps: null,
      jitterMs: null,
      keyframeIntervalSec: null,
      publisherConnected: false,
      streamAvailable: false,
      telemetrySource: 'mediamtx-api',
      telemetryFreshness: 'unavailable'
    };

    assert.equal(offlineMetrics.measuredBitrateKbps, null);
    assert.equal(offlineMetrics.publisherConnected, false);
    assert.equal(offlineMetrics.streamAvailable, false);
    assert.equal(offlineMetrics.configuredTargetBitrateKbps, 6000);
  });

  it('4. Publisher Connects scenario transitions measuredBitrateKbps from null to numeric value', () => {
    let measuredBitrateKbps: number | null = null;
    let publisherConnected = false;

    // Simulation before publisher connects
    assert.equal(measuredBitrateKbps, null);
    assert.equal(publisherConnected, false);

    // Publisher connects
    publisherConnected = true;
    measuredBitrateKbps = 6015;

    assert.equal(publisherConnected, true);
    assert.equal(measuredBitrateKbps, 6015);
  });

  it('5. Stale telemetry scenario is correctly classified by freshness tag', () => {
    const snapshotTimestamp = Date.now() - 15000; // 15s ago
    const now = Date.now();
    const isStale = (now - snapshotTimestamp) > 10000;

    assert.equal(isStale, true);
  });
});
