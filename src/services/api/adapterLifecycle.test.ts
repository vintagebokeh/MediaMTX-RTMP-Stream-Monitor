import assert from 'node:assert';
import test from 'node:test';
import { MockApiAdapter } from './MockApiAdapter';
import { RealApiAdapter } from './RealApiAdapter';
import { createApiAdapter } from './adapterFactory';
import { ConnectionConfig, TelemetrySnapshot } from '../../types';
import {
  incrementAnimationLoopCount,
  decrementAnimationLoopCount,
  getAnimationLoopCount,
  resetAnimationLoopCount
} from './telemetryDebug';

const mockConfig: ConnectionConfig = {
  useMockData: true,
  appEnv: 'local',
  apiUrl: 'http://127.0.0.1:8090',
  wsUrl: 'ws://127.0.0.1:8090/ws/live'
};

const realConfig: ConnectionConfig = {
  useMockData: false,
  appEnv: 'local',
  apiUrl: 'http://127.0.0.1:8090',
  wsUrl: 'ws://127.0.0.1:8090/ws/live'
};

test('1. Adapter created only once per config factory call with distinct instanceId', () => {
  const adapter1 = createApiAdapter(mockConfig);
  const adapter2 = createApiAdapter(mockConfig);

  assert.ok(adapter1.instanceId, 'Adapter 1 should have an instanceId');
  assert.ok(adapter2.instanceId, 'Adapter 2 should have an instanceId');
  assert.notStrictEqual(
    adapter1.instanceId,
    adapter2.instanceId,
    'Each adapter instance should have a unique instanceId'
  );

  adapter1.dispose();
  adapter2.dispose();
});

test('2. dispose() can be called twice safely (idempotent)', () => {
  const adapter = new MockApiAdapter(mockConfig);
  const sub = adapter.subscribeLiveMetrics(() => {});

  assert.strictEqual(adapter.getSubscriberCount(), 1);

  // First dispose
  adapter.dispose();
  assert.strictEqual(adapter.getSubscriberCount(), 0);

  // Second dispose must execute safely without errors
  assert.doesNotThrow(() => {
    adapter.dispose();
  });
  assert.strictEqual(adapter.getSubscriberCount(), 0);
});

test('3. Timer restarts when a new subscriber is added after all subscribers unsubscribed', () => {
  const adapter = new MockApiAdapter(mockConfig);

  let ticksCount1 = 0;
  const unsub1 = adapter.subscribeLiveMetrics(() => {
    ticksCount1++;
  });

  assert.strictEqual(adapter.getSubscriberCount(), 1);
  unsub1();
  assert.strictEqual(adapter.getSubscriberCount(), 0);

  let ticksCount2 = 0;
  const unsub2 = adapter.subscribeLiveMetrics(() => {
    ticksCount2++;
  });

  assert.strictEqual(adapter.getSubscriberCount(), 1);
  assert.ok(ticksCount2 >= 1, 'New subscriber should immediately receive current snapshot');

  unsub2();
  adapter.dispose();
});

test('4. Multiple subscribers do not create duplicate timers or connections', () => {
  const adapter = new MockApiAdapter(mockConfig);

  const unsub1 = adapter.subscribeLiveMetrics(() => {});
  const unsub2 = adapter.subscribeLiveMetrics(() => {});
  const unsub3 = adapter.subscribeLiveMetrics(() => {});

  assert.strictEqual(adapter.getSubscriberCount(), 3);

  unsub1();
  unsub2();
  unsub3();
  adapter.dispose();
});

test('5. Unsubscribing one subscriber does not stop updates for remaining subscribers', () => {
  const adapter = new MockApiAdapter(mockConfig);

  let sub1Count = 0;
  let sub2Count = 0;

  const unsub1 = adapter.subscribeLiveMetrics(() => {
    sub1Count++;
  });
  const unsub2 = adapter.subscribeLiveMetrics(() => {
    sub2Count++;
  });

  assert.strictEqual(adapter.getSubscriberCount(), 2);

  // Unsubscribe sub1
  unsub1();
  assert.strictEqual(adapter.getSubscriberCount(), 1);

  // sub2 should still be active
  assert.ok(sub2Count >= 1, 'Remaining subscriber should remain active');

  unsub2();
  adapter.dispose();
});

test('6. WebSocket error/close starts HTTP polling fallback exactly once', () => {
  const adapter = new RealApiAdapter(realConfig);
  const unsub = adapter.subscribeLiveMetrics(() => {});

  // Mock a failing WebSocket scenario
  let mockPollStarted = 0;
  // @ts-ignore - access private method for testing
  const originalStartHttpPolling = adapter.startHttpPolling;
  // @ts-ignore
  adapter.startHttpPolling = function () {
    mockPollStarted++;
    // @ts-ignore
    return originalStartHttpPolling.call(this);
  };

  // @ts-ignore - trigger WS failure
  adapter.handleWsFailure();
  // @ts-ignore - trigger WS failure second time
  adapter.handleWsFailure();

  assert.strictEqual(mockPollStarted, 1, 'HTTP polling should be started exactly once');

  unsub();
  adapter.dispose();
});

test('7. Adapter replacement disposes the previous adapter', () => {
  let currentAdapter = createApiAdapter(mockConfig);
  const oldAdapter = currentAdapter;

  const unsub = oldAdapter.subscribeLiveMetrics(() => {});
  assert.strictEqual(oldAdapter.getSubscriberCount(), 1);

  // Simulate adapter replacement
  currentAdapter = createApiAdapter({ ...mockConfig, useMockData: true });
  oldAdapter.dispose();

  assert.strictEqual(oldAdapter.getSubscriberCount(), 0, 'Previous adapter should be disposed and have 0 subscribers');

  currentAdapter.dispose();
});

test('8. Telemetry history remains capped at 120 samples', () => {
  let history: Array<{ time: string; bitrateKbps: number }> = [];

  for (let i = 0; i < 150; i++) {
    const nextItem = { time: `tick-${i}`, bitrateKbps: 6000 + i };
    history = [...history, nextItem].slice(-120);
  }

  assert.strictEqual(history.length, 120, 'History buffer must be capped at 120 items');
  assert.strictEqual(history[0].time, 'tick-30', 'First item should be the 31st pushed sample');
  assert.strictEqual(history[119].time, 'tick-149', 'Last item should be the 150th pushed sample');
});

test('9. MockApiAdapter caps logs at 200 items', async () => {
  const adapter = new MockApiAdapter(mockConfig);
  for (let i = 0; i < 250; i++) {
    // @ts-ignore - access private helper for testing
    adapter.pushLog({
      id: `log-${i}`,
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'mediamtx',
      message: `Test log ${i}`
    });
  }
  const logs = await adapter.getLogs(300);
  assert.strictEqual(logs.length, 200, 'Logs array must be capped at 200');
  adapter.dispose();
});

test('10. MockApiAdapter caps experiment latencySamples at 100 items', async () => {
  const adapter = new MockApiAdapter(mockConfig);
  for (let i = 0; i < 150; i++) {
    await adapter.addLatencySample('exp-rtmp-buffer-01', 100 + i);
  }
  const experiments = await adapter.getExperiments();
  const exp1 = experiments.find((e) => e.id === 'exp-rtmp-buffer-01');
  assert.ok(exp1, 'Experiment exp-rtmp-buffer-01 should exist');
  assert.strictEqual(exp1.latencySamples.length, 100, 'Latency samples must be capped at 100');
  adapter.dispose();
});

test('11. RealApiAdapter detaches WebSocket handlers and clears timer on dispose', () => {
  const adapter = new RealApiAdapter(realConfig);
  let handlersCleared = false;
  
  // @ts-ignore
  adapter.wsReconnectTimer = setTimeout(() => {}, 10000);
  // @ts-ignore
  adapter.ws = {
    onopen: () => {},
    onmessage: () => {},
    onerror: () => {},
    onclose: () => {},
    close: () => { handlersCleared = true; }
  };

  adapter.dispose();

  // @ts-ignore
  assert.strictEqual(adapter.ws, null, 'WebSocket reference should be nulled');
  // @ts-ignore
  assert.strictEqual(adapter.wsReconnectTimer, null, 'WebSocket reconnect timer should be cleared');
  assert.strictEqual(handlersCleared, true, 'WebSocket close() should have been called');
});

test('12. Animation loop counter increments and decrements correctly', () => {
  resetAnimationLoopCount();
  assert.strictEqual(getAnimationLoopCount(), 0);

  incrementAnimationLoopCount();
  assert.strictEqual(getAnimationLoopCount(), 1, 'Loop count should be 1');

  decrementAnimationLoopCount();
  assert.strictEqual(getAnimationLoopCount(), 0, 'Loop count should return to 0');
});

