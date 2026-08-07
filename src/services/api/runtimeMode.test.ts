import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveRuntimeDataMode } from '../../types/index.js';
import { createApiAdapter } from './adapterFactory.js';
import { RealApiAdapter } from './RealApiAdapter.js';
import { MockApiAdapter } from './MockApiAdapter.js';

describe('Runtime Mode Selection Tests', () => {
  it('1. Absent VITE_USE_MOCK_DATA resolves to false (real mode)', () => {
    assert.equal(resolveRuntimeDataMode(undefined), 'real');
    assert.equal(resolveRuntimeDataMode(''), 'real');
  });

  it('2. VITE_USE_MOCK_DATA="false" resolves to real mode', () => {
    assert.equal(resolveRuntimeDataMode('false'), 'real');
  });

  it('3. VITE_USE_MOCK_DATA="true" resolves to mock mode', () => {
    assert.equal(resolveRuntimeDataMode('true'), 'mock');
  });

  it('4. createApiAdapter with useMockData=false returns RealApiAdapter', () => {
    const adapter = createApiAdapter({
      apiUrl: 'http://127.0.0.1:3000',
      wsUrl: 'ws://127.0.0.1:3000/ws/live',
      appEnv: 'local',
      useMockData: false
    });

    assert.ok(adapter instanceof RealApiAdapter);
    assert.equal(adapter instanceof MockApiAdapter, false);
    adapter.dispose();
  });

  it('5. createApiAdapter with useMockData=true returns MockApiAdapter', () => {
    const adapter = createApiAdapter({
      apiUrl: 'http://127.0.0.1:3000',
      wsUrl: 'ws://127.0.0.1:3000/ws/live',
      appEnv: 'local',
      useMockData: true
    });

    assert.ok(adapter instanceof MockApiAdapter);
    adapter.dispose();
  });

  it('6. RealApiAdapter failure never falls back to mock or instantiates MockApiAdapter', async () => {
    const realAdapter = new RealApiAdapter({
      apiUrl: 'http://127.0.0.1:59999',
      wsUrl: 'ws://127.0.0.1:59999/ws/live',
      appEnv: 'local',
      useMockData: false
    });

    const health = await realAdapter.getHealth();
    assert.equal(health.mockMode, false);
    assert.equal(health.status, 'error');
    assert.equal(health.measuredBitrateKbps, null);
    assert.equal(health.mediamtxConnected, false);
    assert.ok(realAdapter instanceof RealApiAdapter);
    assert.equal(realAdapter instanceof MockApiAdapter, false);

    const diagnostics = await realAdapter.getRuntimeDiagnostics();
    assert.equal(diagnostics.dataMode, 'real');
    assert.equal(diagnostics.backendReachable, false);

    realAdapter.dispose();
  });

  it('7. Backend offline state in RealApiAdapter does not generate measured bitrate or paths', async () => {
    const realAdapter = new RealApiAdapter({
      apiUrl: 'http://127.0.0.1:59999',
      wsUrl: 'ws://127.0.0.1:59999/ws/live',
      appEnv: 'local',
      useMockData: false
    });

    const paths = await realAdapter.getPaths();
    assert.equal(paths.length, 0);

    const health = await realAdapter.getHealth();
    assert.equal(health.measuredBitrateKbps, null);
    assert.equal(health.totalBitrateKbps, null);

    realAdapter.dispose();
  });
});
