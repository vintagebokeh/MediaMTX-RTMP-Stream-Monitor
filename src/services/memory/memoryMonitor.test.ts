import test from 'node:test';
import assert from 'node:assert';
import { MemoryMonitorService } from './MemoryMonitorService';
import { MemorySample } from '../../types/memory';

test('1. Ring buffer never exceeds history max samples', async () => {
  const service = new MemoryMonitorService({ historyMaxSamples: 360, browserHeapHistoryMaxSamples: 360 });

  for (let i = 0; i < 400; i++) {
    const sample: MemorySample = {
      sampledAt: new Date(Date.now() + i * 10000).toISOString(),
      browserHeapUsedBytes: 500 * 1024 * 1024,
      browserHeapTotalBytes: 1000 * 1024 * 1024,
      browserHeapLimitBytes: 4096 * 1024 * 1024,
      browserHeapUsagePercent: 12.2,
      hostUsedBytes: 20 * 1024 * 1024 * 1024,
      hostAvailableBytes: 12 * 1024 * 1024 * 1024,
      hostAvailablePercent: 37,
      videoElementCount: 1,
      iframeCount: 0,
      canvasCount: 0,
      webSocketCount: 1,
      activeTimers: 2,
      activeAnimationLoops: 1,
      resizeObserverCount: 1,
      subscriberCount: 1,
      adapterInstanceId: 'test-adapter',
      telemetrySource: 'websocket'
    };
    service.addDirectSample(sample);
  }

  const samples = service.getSamples();
  assert.strictEqual(samples.length, 360, 'Ring buffer length must be capped at 360');
  service.dispose();
});

test('2. Health threshold transitions (HEALTHY -> WATCH -> WARNING -> CRITICAL -> EMERGENCY)', async () => {
  const service = new MemoryMonitorService({
    watchAvailablePercent: 30,
    warningAvailablePercent: 20,
    criticalAvailablePercent: 10,
    emergencyAvailablePercent: 5
  });

  const createSampleWithPercent = (percent: number): MemorySample => ({
    sampledAt: new Date().toISOString(),
    browserHeapUsedBytes: 500 * 1024 * 1024,
    browserHeapTotalBytes: 1000 * 1024 * 1024,
    browserHeapLimitBytes: 4096 * 1024 * 1024,
    browserHeapUsagePercent: 12.2,
    hostUsedBytes: Math.round(((100 - percent) / 100) * 32 * 1024 * 1024 * 1024),
    hostAvailableBytes: Math.round((percent / 100) * 32 * 1024 * 1024 * 1024),
    hostAvailablePercent: percent,
    videoElementCount: 1,
    iframeCount: 0,
    canvasCount: 0,
    webSocketCount: 1,
    activeTimers: 2,
    activeAnimationLoops: 1,
    resizeObserverCount: 1,
    subscriberCount: 1,
    adapterInstanceId: 'test-adapter',
    telemetrySource: 'websocket'
  });

  service.addDirectSample(createSampleWithPercent(35));
  assert.strictEqual(service.getHostHealthState(), 'HEALTHY');

  service.addDirectSample(createSampleWithPercent(28));
  assert.strictEqual(service.getHostHealthState(), 'WATCH');

  service.addDirectSample(createSampleWithPercent(18));
  assert.strictEqual(service.getHostHealthState(), 'WARNING');

  service.addDirectSample(createSampleWithPercent(8));
  assert.strictEqual(service.getHostHealthState(), 'CRITICAL');

  service.addDirectSample(createSampleWithPercent(3));
  assert.strictEqual(service.getHostHealthState(), 'EMERGENCY');

  service.dispose();
});

test('3. Browser Heap warning & critical thresholds and correlation suspicion', async () => {
  const service = new MemoryMonitorService({
    browserHeapWarningPercent: 80,
    browserHeapCriticalPercent: 90
  });

  // Add 5 samples so baseline requirement (>= 5) passes
  for (let i = 0; i < 5; i++) {
    const sampleWarning: MemorySample = {
      sampledAt: new Date(Date.now() + i * 10000).toISOString(),
      browserHeapUsedBytes: (3000 + i * 100) * 1024 * 1024,
      browserHeapTotalBytes: 4000 * 1024 * 1024,
      browserHeapLimitBytes: 4000 * 1024 * 1024,
      browserHeapUsagePercent: 85,
      hostUsedBytes: 16 * 1024 * 1024 * 1024,
      hostAvailableBytes: 16 * 1024 * 1024 * 1024,
      hostAvailablePercent: 50,
      videoElementCount: 4,
      iframeCount: 0,
      canvasCount: 0,
      webSocketCount: 1,
      activeTimers: 2,
      activeAnimationLoops: 1,
      resizeObserverCount: 1,
      subscriberCount: 1,
      adapterInstanceId: 'test-adapter',
      telemetrySource: 'websocket'
    };
    service.addDirectSample(sampleWarning);
  }

  assert.strictEqual(service.getBrowserHeapHealthState(), 'WARNING');

  const correlation = service.getCorrelationAnalysis();
  assert.strictEqual(correlation.leakSuspicion, 'POSSIBLE_LEAK');
  assert.ok(correlation.suspicionReason?.includes('media cleanup'), 'Should flag media element cleanup issue');

  service.dispose();
});

test('4. Automatic diagnostic snapshot capture when entering WARNING state', async () => {
  const service = new MemoryMonitorService({
    warningAvailablePercent: 20
  });

  const sampleWarning: MemorySample = {
    sampledAt: new Date().toISOString(),
    browserHeapUsedBytes: 500 * 1024 * 1024,
    browserHeapTotalBytes: 1000 * 1024 * 1024,
    browserHeapLimitBytes: 4096 * 1024 * 1024,
    browserHeapUsagePercent: 12.2,
    hostUsedBytes: 26 * 1024 * 1024 * 1024,
    hostAvailableBytes: 6 * 1024 * 1024 * 1024,
    hostAvailablePercent: 18,
    videoElementCount: 1,
    iframeCount: 0,
    canvasCount: 0,
    webSocketCount: 1,
    activeTimers: 2,
    activeAnimationLoops: 1,
    resizeObserverCount: 1,
    subscriberCount: 1,
    adapterInstanceId: 'test-adapter',
    telemetrySource: 'websocket'
  };

  service.addDirectSample(sampleWarning);
  const summary = service.getMetricsSummary();

  assert.ok(summary.automaticDiagnosticSnapshot !== null, 'Diagnostic snapshot must be automatically captured');
  assert.strictEqual(summary.automaticDiagnosticSnapshot.telemetryHealth, 'warning');

  service.dispose();
});

test('5. Timer cleanup on dispose', async () => {
  const service = new MemoryMonitorService({ sampleIntervalMs: 100 });
  service.start();

  let called = 0;
  service.subscribe(() => {
    called++;
  });

  service.dispose();
  const countBefore = called;

  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.strictEqual(called, countBefore, 'Timer should be cleaned up on dispose');
});
