import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { MediaMtxTelemetryCollector } from './MediaMtxTelemetryCollector.js';
import {
  samplePathDataLiveTest,
  sampleRtmpConnsList,
  sampleWebRtcSessionsList,
  sampleMetricsText
} from './fixtures/mediamtxFixtures.js';

describe('MediaMtxTelemetryCollector', () => {
  it('normalizes real MediaMTX path snapshot correctly', () => {
    const collector = new MediaMtxTelemetryCollector();
    const metrics = collector.parseMetrics(sampleMetricsText);

    const pathData = samplePathDataLiveTest;
    const snap = collector.normalizePathSnapshot(
      pathData,
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      metrics,
      new Date().toISOString()
    );

    assert.strictEqual(snap.path, 'live/test');
    assert.strictEqual(snap.publisher.connected, true);
    assert.strictEqual(snap.publisher.sourceType, 'rtmpConn');
    assert.strictEqual(snap.publisher.id, 'c90880f2-7696-43f1-b04e-acc76b1e956e');
    assert.strictEqual(snap.publisher.remoteAddress, '127.0.0.1:51406');

    // Readers
    assert.strictEqual(snap.readers.count, 1);
    assert.strictEqual(snap.readers.items[0].type, 'webRTCSession');
    assert.strictEqual(snap.readers.items[0].id, '14cdd1c1-86ba-41ae-a200-b0f29d21a38c');

    // Tracks2 resolution
    assert.strictEqual(snap.media.video.codec, 'H264');
    assert.strictEqual(snap.media.video.width, 1920);
    assert.strictEqual(snap.media.video.height, 1080);
    assert.strictEqual(snap.media.video.profile, 'Baseline');
    assert.strictEqual(snap.media.video.level, '4.2');

    assert.strictEqual(snap.media.audio.codec, 'MPEG-4 Audio');
    assert.strictEqual(snap.media.audio.sampleRate, 48000);
    assert.strictEqual(snap.media.audio.channels, 2);
  });

  it('handles first sample as WARMING_UP with null measuredBitrateKbps', () => {
    const collector = new MediaMtxTelemetryCollector();
    const pathData = { ...samplePathDataLiveTest, bytesReceived: 1000000 };
    const sampledAt = new Date().toISOString();

    const snap = collector.normalizePathSnapshot(
      pathData,
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      sampledAt
    );

    assert.strictEqual(snap.stream.state, 'WARMING_UP');
    assert.strictEqual(snap.telemetry.measuredBitrateKbps, null);
  });

  it('calculates measuredBitrateKbps on second sample and sets state to LIVE', async () => {
    const collector = new MediaMtxTelemetryCollector();
    const now = Date.now();
    const t1 = new Date(now).toISOString();
    const t2 = new Date(now + 2000).toISOString(); // 2 seconds later

    const pathData1 = { ...samplePathDataLiveTest, inboundBytes: 1000000, bytesReceived: 1000000 };
    collector.normalizePathSnapshot(
      pathData1,
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      t1
    );

    // +1,500,000 bytes over 2 seconds = 750,000 Bps = 6,000,000 bps = 6000 Kbps
    const pathData2 = { ...samplePathDataLiveTest, inboundBytes: 2500000, bytesReceived: 2500000 };
    const snap2 = collector.normalizePathSnapshot(
      pathData2,
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      t2
    );

    assert.strictEqual(snap2.stream.state, 'LIVE');
    assert.strictEqual(snap2.telemetry.measuredBitrateKbps, 6000);
    assert.strictEqual(snap2.telemetry.instantBitrateKbps, 6000);
    assert.strictEqual(snap2.telemetry.smoothedBitrateKbps, 6000);
  });

  it('keeps static-content low bitrate (600 Kbps) as raw value without forcing to target', () => {
    const collector = new MediaMtxTelemetryCollector();
    const now = Date.now();
    const t1 = new Date(now).toISOString();
    const t2 = new Date(now + 2000).toISOString();

    // 150,000 bytes over 2s = 75,000 Bps = 600,000 Bps = 600 Kbps
    collector.normalizePathSnapshot(
      { ...samplePathDataLiveTest, inboundBytes: 1000000, bytesReceived: 1000000 },
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      t1
    );

    const snap2 = collector.normalizePathSnapshot(
      { ...samplePathDataLiveTest, inboundBytes: 1150000, bytesReceived: 1150000 },
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      t2
    );

    assert.strictEqual(snap2.telemetry.instantBitrateKbps, 600);
    assert.strictEqual(snap2.telemetry.measuredBitrateKbps, 600);
    assert.strictEqual(snap2.telemetry.configuredTargetBitrateKbps, 6000);
    assert.strictEqual(snap2.stream.transportHealth, 'HEALTHY');
  });

  it('calculates deterministic EMA smoothing across consecutive samples', () => {
    const collector = new MediaMtxTelemetryCollector();
    const now = Date.now();

    // Sample 1 (t0): baseline
    collector.normalizePathSnapshot(
      { ...samplePathDataLiveTest, inboundBytes: 0 },
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      new Date(now).toISOString()
    );

    // Sample 2 (t+1s): 1,000,000 bytes = 8,000 Kbps => Instant=8000, Smoothed=8000
    const snap2 = collector.normalizePathSnapshot(
      { ...samplePathDataLiveTest, inboundBytes: 1000000 },
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      new Date(now + 1000).toISOString()
    );
    assert.strictEqual(snap2.telemetry.instantBitrateKbps, 8000);
    assert.strictEqual(snap2.telemetry.smoothedBitrateKbps, 8000);

    // Sample 3 (t+2s): +500,000 bytes over 1s = 4,000 Kbps => Instant=4000
    // EMA = Math.round(0.25 * 4000 + 0.75 * 8000) = 1000 + 6000 = 7000
    const snap3 = collector.normalizePathSnapshot(
      { ...samplePathDataLiveTest, inboundBytes: 1500000 },
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      new Date(now + 2000).toISOString()
    );
    assert.strictEqual(snap3.telemetry.instantBitrateKbps, 4000);
    assert.strictEqual(snap3.telemetry.smoothedBitrateKbps, 7000);
    assert.strictEqual(snap3.telemetry.averageBitrateKbps60s, 6000); // (8000 + 4000)/2
  });

  it('evaluates compliance mode strictly when BITRATE_COMPLIANCE_MODE=strict', () => {
    process.env.BITRATE_COMPLIANCE_MODE = 'strict';
    process.env.BITRATE_TARGET_LOW_PERCENT = '80';
    process.env.BITRATE_TARGET_HIGH_PERCENT = '120';

    const collector = new MediaMtxTelemetryCollector();
    const now = Date.now();

    collector.normalizePathSnapshot(
      { ...samplePathDataLiveTest, inboundBytes: 0 },
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      new Date(now).toISOString()
    );

    // 600 Kbps is far below 80% of 6000 Kbps (4800 Kbps)
    const snapLow = collector.normalizePathSnapshot(
      { ...samplePathDataLiveTest, inboundBytes: 75000 },
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      new Date(now + 1000).toISOString()
    );

    assert.strictEqual(snapLow.telemetry.compliance?.mode, 'strict');
    assert.strictEqual(snapLow.telemetry.compliance?.status, 'BELOW_TARGET_RANGE');
    // Transport health remains HEALTHY because low VBR bitrate is not a network failure
    assert.strictEqual(snapLow.stream.transportHealth, 'HEALTHY');

    delete process.env.BITRATE_COMPLIANCE_MODE;
    delete process.env.BITRATE_TARGET_LOW_PERCENT;
    delete process.env.BITRATE_TARGET_HIGH_PERCENT;
  });

  it('resets baseline on publisher disconnect and sets state to OFFLINE', () => {
    const collector = new MediaMtxTelemetryCollector();
    const t1 = new Date().toISOString();

    // 1st sample
    collector.normalizePathSnapshot(
      samplePathDataLiveTest,
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      t1
    );

    // Disconnect publisher
    const offlinePath = {
      ...samplePathDataLiveTest,
      ready: false,
      source: null,
      bytesReceived: 0
    };

    const snapOffline = collector.normalizePathSnapshot(
      offlinePath,
      [],
      sampleWebRtcSessionsList.items,
      undefined,
      new Date().toISOString()
    );

    assert.strictEqual(snapOffline.stream.state, 'OFFLINE');
    assert.strictEqual(snapOffline.publisher.connected, false);
    assert.strictEqual(snapOffline.telemetry.measuredBitrateKbps, null);

    // Reconnect publisher -> first sample should be WARMING_UP again
    const snapReconnect = collector.normalizePathSnapshot(
      samplePathDataLiveTest,
      sampleRtmpConnsList.items,
      sampleWebRtcSessionsList.items,
      undefined,
      new Date().toISOString()
    );

    assert.strictEqual(snapReconnect.stream.state, 'WARMING_UP');
    assert.strictEqual(snapReconnect.telemetry.measuredBitrateKbps, null);
  });
});
