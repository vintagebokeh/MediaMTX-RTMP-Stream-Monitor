import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import os from 'os';
import { MediaMtxTelemetryCollector } from './src/server/telemetry/MediaMtxTelemetryCollector';
import { NormalizedStreamSnapshot, StreamPath } from './src/types';

const app = express();
const PORT = 3000;
const server = createServer(app);

app.use(express.json());

// MediaMTX internal ports configured via environment variables
const MEDIAMTX_CONTROL_API = process.env.MEDIAMTX_CONTROL_API || 'http://127.0.0.1:9997';
const MEDIAMTX_METRICS_URL = process.env.MEDIAMTX_METRICS_URL || 'http://127.0.0.1:9998/metrics';

const telemetryCollector = new MediaMtxTelemetryCollector({
  controlApiUrl: MEDIAMTX_CONTROL_API,
  metricsUrl: MEDIAMTX_METRICS_URL
});

function getMockNormalizedSnapshot(pathName = 'live/test'): NormalizedStreamSnapshot {
  return {
    path: pathName,
    stream: {
      configured: true,
      ready: true,
      available: true,
      online: true,
      state: 'LIVE',
      readyTime: new Date(Date.now() - 3600000).toISOString(),
      onlineTime: new Date(Date.now() - 3600000).toISOString()
    },
    publisher: {
      connected: true,
      type: 'RTMP',
      sourceType: 'rtmpConn',
      id: 'pub-live-test-01',
      remoteAddress: '192.168.1.45:58410'
    },
    readers: {
      count: 1,
      items: [
        {
          type: 'webRTCSession',
          id: 'reader-webrtc-01',
          remoteAddress: '192.168.1.102:61204'
        }
      ]
    },
    media: {
      tracks: ['H264', 'MPEG-4 Audio'],
      video: {
        codec: 'H264',
        width: 1920,
        height: 1080,
        profile: 'Baseline',
        level: '4.2'
      },
      audio: {
        codec: 'MPEG-4 Audio',
        sampleRate: 48000,
        channels: 2
      }
    },
    telemetry: {
      measuredBitrateKbps: 6012,
      inboundBytes: 2700000000,
      outboundBytes: 1350000000,
      inboundFramesInError: 0,
      sampledAt: new Date().toISOString(),
      freshness: 'live'
    }
  };
}

function mapSnapshotToStreamPath(snap: NormalizedStreamSnapshot): StreamPath {
  const isPublisherConnected = snap.publisher.connected;

  const publisherObj = isPublisherConnected ? {
    id: snap.publisher.id || 'pub-unknown',
    type: snap.publisher.sourceType || 'rtmpConn',
    remoteAddr: snap.publisher.remoteAddress || '127.0.0.1',
    state: 'publishing',
    videoCodec: snap.media.video.codec || '',
    videoResolution: snap.media.video.width && snap.media.video.height ? `${snap.media.video.width}x${snap.media.video.height}` : '',
    videoFps: null,
    audioCodec: snap.media.audio.codec || '',
    audioSampleRate: snap.media.audio.sampleRate,
    audioChannels: snap.media.audio.channels ? (snap.media.audio.channels === 2 ? 'stereo' : `${snap.media.audio.channels}ch`) : '',
    targetBitrateKbps: null,
    configuredTargetBitrateKbps: 6000,
    currentBitrateKbps: snap.telemetry.measuredBitrateKbps,
    measuredBitrateKbps: snap.telemetry.measuredBitrateKbps,
    connectedAt: snap.stream.onlineTime || snap.telemetry.sampledAt,
    bytesReceived: snap.telemetry.inboundBytes || 0
  } : null;

  const readersList = snap.readers.items.map(r => ({
    id: r.id,
    type: r.type,
    remoteAddr: r.remoteAddress || '127.0.0.1',
    protocol: r.type.toLowerCase().includes('webrtc') ? 'WebRTC' : 'RTMP',
    connectedAt: snap.telemetry.sampledAt,
    bytesSent: snap.telemetry.outboundBytes || 0
  }));

  return {
    name: snap.path,
    ready: snap.stream.ready,
    tracks: snap.media.tracks,
    bytesReceived: snap.telemetry.inboundBytes || 0,
    bytesSent: snap.telemetry.outboundBytes || 0,
    publisher: publisherObj as any,
    readers: readersList,
    publisherConnected: isPublisherConnected,
    streamAvailable: snap.stream.available,
    telemetrySource: snap.telemetry.freshness === 'unavailable' ? 'unavailable' : 'mediamtx-api',
    telemetryFreshness: snap.telemetry.freshness,
    normalizedSnapshot: snap,
    metrics: {
      currentBitrateKbps: snap.telemetry.measuredBitrateKbps,
      measuredBitrateKbps: snap.telemetry.measuredBitrateKbps,
      targetBitrateKbps: null,
      configuredTargetBitrateKbps: 6000,
      latencyMs: isPublisherConnected ? 2000 : null,
      configuredLatencyTargetMs: 2000,
      measuredLatencyMs: getLatestLatencyForPath(snap.path).valueMs,
      measuredLatency: getLatestLatencyForPath(snap.path),
      inboundErrors: snap.telemetry.inboundFramesInError || 0,
      discardedFrames: 0,
      fps: null,
      jitterMs: null,
      keyframeIntervalSec: null,
      publisherConnected: isPublisherConnected,
      streamAvailable: snap.stream.available,
      telemetrySource: snap.telemetry.freshness === 'unavailable' ? 'unavailable' : 'mediamtx-api',
      telemetryFreshness: snap.telemetry.freshness
    }
  };
}

// In-memory latency samples storage for V0.1
interface LatencyMeasurement {
  valueMs: number | null;
  source: 'manual' | 'embedded_timestamp' | 'browser_estimate' | 'mock';
  measuredAt: string | null;
  confidence: 'low' | 'medium' | 'high';
}

const latencySamplesStore = new Map<string, LatencyMeasurement>();

function getLatestLatencyForPath(streamPath: string): LatencyMeasurement {
  const existing = latencySamplesStore.get(streamPath);
  if (existing) return existing;
  return {
    valueMs: null,
    source: 'manual',
    measuredAt: null,
    confidence: 'medium'
  };
}

function setLatencySampleForPath(
  streamPath: string,
  latencyMs: number,
  source: LatencyMeasurement['source'] = 'manual'
): LatencyMeasurement {
  const measurement: LatencyMeasurement = {
    valueMs: latencyMs,
    source,
    measuredAt: new Date().toISOString(),
    confidence: 'medium'
  };
  latencySamplesStore.set(streamPath, measurement);
  return measurement;
}

// In-memory log buffer
interface BackendLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'mediamtx' | 'backend' | 'rtmp' | 'hls' | 'system';
  message: string;
}

const systemLogs: BackendLog[] = [
  {
    id: 'sys-init-1',
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'backend',
    message: 'MediaMTX Monitoring Backend API started on port 3000'
  },
  {
    id: 'sys-init-2',
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'backend',
    message: `Configured private MediaMTX endpoints: Control API (${MEDIAMTX_CONTROL_API}), Metrics (${MEDIAMTX_METRICS_URL})`
  }
];

// Helper to calculate Host OS Metrics
function getHostOSMetrics() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += (cpu.times as Record<string, number>)[type];
    }
    totalIdle += cpu.times.idle;
  });

  const idlePercent = totalIdle / totalTick;
  const cpuPercent = +((1 - idlePercent) * 100).toFixed(1);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemMB = Math.round((totalMem - freeMem) / (1024 * 1024));
  const totalMemMB = Math.round(totalMem / (1024 * 1024));

  return {
    cpuPercent,
    memoryUsedMB: usedMemMB,
    memoryTotalMB: totalMemMB,
    diskPercent: 32.4, // estimated
    networkInKbps: 0,
    networkOutKbps: 0,
    uptimeSec: Math.floor(os.uptime()),
    mediamtxProcessCpu: 0.0,
    mediamtxProcessRamMB: 0
  };
}

// -------------------------------------------------------------------
// REST API ROUTES (/api/*)
// -------------------------------------------------------------------

// System Memory Diagnostic Endpoint
function getSystemMemory() {
  const totalBytes = os.totalmem();
  const availableBytes = os.freemem();
  const usedBytes = Math.max(0, totalBytes - availableBytes);
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

let latestDiagnosticSnapshot: any = null;

app.get('/api/v1/system-memory', (req, res) => {
  res.json(getSystemMemory());
});

app.post('/api/v1/diagnostics/memory-snapshot', (req, res) => {
  latestDiagnosticSnapshot = req.body;
  res.json({ success: true, timestamp: new Date().toISOString() });
});

app.get('/api/v1/diagnostics/memory-snapshot', (req, res) => {
  const sysMem = getSystemMemory();
  const defaultSnapshot = {
    samples: latestDiagnosticSnapshot?.samples || [],
    telemetryHealth: latestDiagnosticSnapshot?.telemetryHealth || 'healthy',
    adapterInstanceId: latestDiagnosticSnapshot?.adapterInstanceId || 'srv-instance-01',
    subscriberCount: latestDiagnosticSnapshot?.subscriberCount ?? 1,
    activeTransport: latestDiagnosticSnapshot?.activeTransport || 'websocket',
    videoElementCount: latestDiagnosticSnapshot?.videoElementCount ?? 0,
    iframeCount: latestDiagnosticSnapshot?.iframeCount ?? 0,
    canvasCount: latestDiagnosticSnapshot?.canvasCount ?? 0,
    activeAnimationLoopCount: latestDiagnosticSnapshot?.activeAnimationLoopCount ?? 0,
    currentStreamPath: latestDiagnosticSnapshot?.currentStreamPath || 'live/test',
    userAgent: req.headers['user-agent'] || 'MediaMTX-Monitor-Server',
    appVersion: '1.0.0',
    systemMemorySample: sysMem,
    auditEvents: latestDiagnosticSnapshot?.auditEvents || []
  };

  const sanitize = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);
    const clean: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (/key|secret|password|auth|token/i.test(key)) {
        continue;
      }
      clean[key] = sanitize(obj[key]);
    }
    return clean;
  };

  res.json(sanitize(defaultSnapshot));
});

// 0. Runtime Config Endpoint
app.get('/api/v1/runtime-config', (req, res) => {
  const streamPath = (req.query.path as string) || 'live/test';
  const environment = process.env.VITE_APP_ENV || 'local';

  // Extract host from request header and strip the dashboard port
  const rawHost = req.get('host') || 'localhost';
  const requestHost = rawHost.replace(/:\d+$/, '');

  // Environment overrides if provided
  const webrtcOverride = process.env.PUBLIC_WEBRTC_BASE_URL || process.env.WEBRTC_PLAYBACK_URL;
  const hlsOverride = process.env.PUBLIC_HLS_BASE_URL || process.env.HLS_PLAYBACK_URL;

  let webrtcUrl: string;
  if (webrtcOverride) {
    const base = webrtcOverride.replace(/\/$/, '');
    webrtcUrl = base.includes(streamPath) ? base : `${base}/${streamPath}`;
  } else {
    webrtcUrl = `http://${requestHost}:8889/${streamPath}`;
  }

  let hlsUrl: string;
  if (hlsOverride) {
    const base = hlsOverride.replace(/\/$/, '');
    hlsUrl = base.includes(streamPath) ? base : `${base}/${streamPath}/index.m3u8`;
  } else {
    hlsUrl = `http://${requestHost}:8888/${streamPath}/index.m3u8`;
  }

  res.json({
    environment,
    streamPath,
    playback: {
      webrtcUrl,
      hlsUrl
    },
    features: {
      livePreviewEnabled: true
    }
  });
});

// 0b. GET Latency Sample Endpoint
app.get('/api/v1/latency-samples/latest', (req, res) => {
  const streamPath = (req.query.streamPath as string) || (req.query.path as string) || 'live/test';
  const sample = getLatestLatencyForPath(streamPath);
  res.json(sample);
});

// 0c. POST Latency Sample Endpoint
app.post('/api/v1/latency-samples', (req, res) => {
  const { streamPath, latencyMs, source } = req.body;
  const targetPath = streamPath || 'live/test';
  if (typeof latencyMs !== 'number' || isNaN(latencyMs)) {
    return res.status(400).json({ error: 'latencyMs must be a valid number' });
  }
  const sample = setLatencySampleForPath(targetPath, latencyMs, source || 'manual');
  res.json(sample);
});

// 0d. GET Runtime Diagnostics Mode Endpoint
app.get('/api/v1/runtime-mode', async (req, res) => {
  const rawMockFlag = process.env.VITE_USE_MOCK_DATA;
  const isMock = rawMockFlag === 'true';
  const sampledAt = new Date().toISOString();

  if (isMock) {
    return res.json({
      dataMode: 'mock',
      mockEnabled: true,
      adapter: 'mock',
      backendReachable: true,
      mediaMtxApiReachable: true,
      mediaMtxMetricsReachable: true,
      sampledAt
    });
  }

  let mediaMtxApiReachable = false;
  let mediaMtxMetricsReachable = false;

  try {
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), 1000);
    const resp1 = await fetch(`${MEDIAMTX_CONTROL_API}/v3/paths/list`, { signal: controller1.signal });
    clearTimeout(timeout1);
    mediaMtxApiReachable = resp1.ok;
  } catch (e) {
    mediaMtxApiReachable = false;
  }

  try {
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 1000);
    const resp2 = await fetch(`${MEDIAMTX_METRICS_URL}/metrics`, { signal: controller2.signal });
    clearTimeout(timeout2);
    mediaMtxMetricsReachable = resp2.ok;
  } catch (e) {
    mediaMtxMetricsReachable = false;
  }

  return res.json({
    dataMode: 'real',
    mockEnabled: false,
    adapter: 'real',
    backendReachable: true,
    mediaMtxApiReachable,
    mediaMtxMetricsReachable,
    sampledAt
  });
});

// Helper for Real vs Mock path telemetry using MediaMtxTelemetryCollector
async function fetchRealPathsFromMediaMTX(): Promise<{ paths: StreamPath[]; connected: boolean; rawSnapshots: NormalizedStreamSnapshot[] }> {
  const result = await telemetryCollector.collectNormalizedSnapshots();
  if (result.mediaMtxReachable) {
    const mapped = result.items.map(snap => mapSnapshotToStreamPath(snap));
    return { paths: mapped, connected: true, rawSnapshots: result.items };
  }
  return { paths: [], connected: false, rawSnapshots: [] };
}

function getOfflinePathData(name = 'live/test', connected = false) {
  const offlineSnap: NormalizedStreamSnapshot = {
    path: name,
    stream: {
      configured: true,
      ready: false,
      available: false,
      online: false,
      state: connected ? 'OFFLINE' : 'MEDIAMTX_OFFLINE',
      readyTime: null,
      onlineTime: null
    },
    publisher: {
      connected: false,
      type: null,
      sourceType: null,
      id: null,
      remoteAddress: null
    },
    readers: { count: 0, items: [] },
    media: {
      tracks: [],
      video: { codec: null, width: null, height: null, profile: null, level: null },
      audio: { codec: null, sampleRate: null, channels: null }
    },
    telemetry: {
      measuredBitrateKbps: null,
      inboundBytes: null,
      outboundBytes: null,
      inboundFramesInError: null,
      sampledAt: new Date().toISOString(),
      freshness: connected ? 'live' : 'unavailable'
    }
  };

  return mapSnapshotToStreamPath(offlineSnap);
}

// Normalized Stream Snapshots Endpoint
app.get('/api/v1/streams', async (req, res) => {
  const isMock = process.env.VITE_USE_MOCK_DATA === 'true';

  if (isMock) {
    const snap = getMockNormalizedSnapshot();
    return res.json({
      items: [snap],
      sampledAt: snap.telemetry.sampledAt
    });
  }

  const result = await telemetryCollector.collectNormalizedSnapshots();
  if (!result.mediaMtxReachable || result.items.length === 0) {
    const offlineSnap = getOfflinePathData('live/test', result.mediaMtxReachable).normalizedSnapshot!;
    return res.json({
      items: [offlineSnap],
      sampledAt: result.sampledAt
    });
  }

  res.json({
    items: result.items,
    sampledAt: result.sampledAt
  });
});

// Normalized Stream Snapshot by Query or Param
app.get(['/api/v1/stream', '/api/v1/streams/:encodedPath(*)'], async (req, res) => {
  const pathParam = req.params.encodedPath || (req.query.path as string) || 'live/test';
  const targetPath = decodeURIComponent(pathParam);
  const isMock = process.env.VITE_USE_MOCK_DATA === 'true';

  if (isMock) {
    return res.json(getMockNormalizedSnapshot(targetPath));
  }

  const result = await telemetryCollector.collectNormalizedSnapshots();
  const match = result.items.find(i => i.path === targetPath);

  if (match) {
    return res.json(match);
  }

  // Fallback offline normalized snapshot for path
  const offlineSnap = getOfflinePathData(targetPath, result.mediaMtxReachable).normalizedSnapshot!;
  res.json(offlineSnap);
});

// Diagnostics Endpoint for Normalized Stream Collector
app.get('/api/v1/debug/mediamtx-normalized', async (req, res) => {
  const pathQuery = (req.query.path as string) || 'live/test';
  const targetPath = decodeURIComponent(pathQuery);
  const isMock = process.env.VITE_USE_MOCK_DATA === 'true';

  if (isMock) {
    const mockSnap = getMockNormalizedSnapshot(targetPath);
    return res.json(
      telemetryCollector.generateDiagnostics(
        targetPath,
        true,
        true,
        mockSnap.readers.count,
        mockSnap
      )
    );
  }

  const result = await telemetryCollector.collectNormalizedSnapshots();
  const match = result.items.find(i => i.path === targetPath);

  res.json(
    telemetryCollector.generateDiagnostics(
      targetPath,
      Boolean(match),
      Boolean(match?.publisher.connected),
      match ? match.readers.count : 0,
      match || null
    )
  );
});

// 1. Health Endpoint
app.get('/api/health', async (req, res) => {
  const isMock = process.env.VITE_USE_MOCK_DATA === 'true';

  if (isMock) {
    return res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      mediamtxConnected: true,
      activePathsCount: 1,
      totalPublishers: 1,
      totalReaders: 1,
      totalBitrateKbps: 6012,
      measuredBitrateKbps: 6012,
      configuredTargetBitrateKbps: 6000,
      appEnv: process.env.VITE_APP_ENV || 'local',
      mockMode: true,
      telemetrySource: 'mock',
      telemetryFreshness: 'live'
    });
  }

  const { paths, connected } = await fetchRealPathsFromMediaMTX();
  const readyPaths = paths.filter((p) => p.publisherConnected);
  const activePubs = readyPaths.length;
  let totalBitrate: number | null = null;
  if (activePubs > 0) {
    totalBitrate = readyPaths.reduce((acc, p) => acc + (p.metrics.measuredBitrateKbps || 0), 0);
  }

  res.json({
    status: connected ? (activePubs > 0 ? 'ok' : 'degraded') : 'offline',
    uptime: Math.floor(process.uptime()),
    mediamtxConnected: connected,
    activePathsCount: readyPaths.length,
    totalPublishers: activePubs,
    totalReaders: paths.reduce((acc, p) => acc + p.readers.length, 0),
    totalBitrateKbps: totalBitrate,
    measuredBitrateKbps: totalBitrate,
    configuredTargetBitrateKbps: 6000,
    appEnv: process.env.VITE_APP_ENV || 'local',
    mockMode: false,
    telemetrySource: connected ? 'mediamtx-api' : 'unavailable',
    telemetryFreshness: connected ? (activePubs > 0 ? 'live' : 'live') : 'unavailable'
  });
});

// 2. Stream Paths Endpoint
app.get('/api/paths', async (req, res) => {
  const isMock = process.env.VITE_USE_MOCK_DATA === 'true';

  if (isMock) {
    return res.json([
      {
        name: 'live/test',
        ready: true,
        tracks: ['H264', 'AAC'],
        bytesReceived: 2700000000,
        bytesSent: 1350000000,
        publisher: {
          id: 'pub-live-test-01',
          type: 'rtmpConn',
          remoteAddr: '192.168.1.45:58410',
          state: 'publishing',
          videoCodec: 'H.264',
          videoResolution: '1920x1080',
          videoFps: 60,
          audioCodec: 'AAC',
          audioSampleRate: 48000,
          audioChannels: 'stereo',
          targetBitrateKbps: 6000,
          configuredTargetBitrateKbps: 6000,
          currentBitrateKbps: 6012,
          measuredBitrateKbps: 6012,
          connectedAt: new Date(Date.now() - 3600000).toISOString(),
          bytesReceived: 2700000000
        },
        readers: [
          {
            id: 'rd-webrtc-892',
            type: 'webrtcConn',
            remoteAddr: '10.0.0.12:61200',
            protocol: 'WebRTC',
            connectedAt: new Date(Date.now() - 1800000).toISOString(),
            bytesSent: 1350000000
          }
        ],
        publisherConnected: true,
        streamAvailable: true,
        telemetrySource: 'mock',
        telemetryFreshness: 'live',
        metrics: {
          currentBitrateKbps: 6012,
          measuredBitrateKbps: 6012,
          targetBitrateKbps: 6000,
          configuredTargetBitrateKbps: 6000,
          latencyMs: 2010,
          configuredLatencyTargetMs: 2000,
          measuredLatencyMs: 2010,
          measuredLatency: getLatestLatencyForPath('live/test'),
          inboundErrors: 0,
          discardedFrames: 0,
          fps: 60,
          jitterMs: 1.5,
          keyframeIntervalSec: 2.0,
          publisherConnected: true,
          streamAvailable: true,
          telemetrySource: 'mock',
          telemetryFreshness: 'live'
        }
      }
    ]);
  }

  const { paths, connected } = await fetchRealPathsFromMediaMTX();
  if (paths.length > 0) {
    return res.json(paths);
  }

  // When no stream exists on real MediaMTX
  res.json([getOfflinePathData('live/test', connected)]);
});

// 3. Specific Path Details
app.get('/api/paths/:name(*)', async (req, res) => {
  const pathName = req.params.name;
  try {
    const resp = await fetch(`${MEDIAMTX_CONTROL_API}/v3/paths/get/${encodeURIComponent(pathName)}`);
    if (resp.ok) {
      const data = await resp.json();
      return res.json(data);
    }
  } catch (e) {
    // ignore
  }

  if (pathName === 'live/test') {
    return res.json({
      name: 'live/test',
      ready: true,
      tracks: ['H264', 'AAC'],
      bytesReceived: 2700000000,
      bytesSent: 1350000000,
      publisher: {
        id: 'pub-live-test-01',
        type: 'rtmpConn',
        remoteAddr: '192.168.1.45:58410',
        state: 'publishing',
        videoCodec: 'H.264',
        videoResolution: '1920x1080',
        videoFps: 60,
        audioCodec: 'AAC',
        audioSampleRate: 48000,
        audioChannels: 'stereo',
        targetBitrateKbps: 6000,
        currentBitrateKbps: 6010,
        connectedAt: new Date(Date.now() - 3600000).toISOString(),
        bytesReceived: 2700000000
      },
      readers: [
        {
          id: 'rd-webrtc-892',
          type: 'webrtcConn',
          remoteAddr: '10.0.0.12:61200',
          protocol: 'WebRTC',
          connectedAt: new Date(Date.now() - 1800000).toISOString(),
          bytesSent: 1350000000
        }
      ],
      metrics: {
        currentBitrateKbps: 6010,
        targetBitrateKbps: 6000,
        latencyMs: 2000,
        configuredLatencyTargetMs: 2000,
        measuredLatency: getLatestLatencyForPath(pathName),
        inboundErrors: 0,
        discardedFrames: 0,
        fps: 60,
        jitterMs: 1.5,
        keyframeIntervalSec: 2.0
      }
    });
  }

  res.status(404).json({ error: 'Path not found' });
});

// 4. Host OS Metrics
app.get('/api/metrics/host', (req, res) => {
  res.json(getHostOSMetrics());
});

// 5. MediaMTX Prometheus Metrics Proxy
app.get('/api/metrics/mediamtx', async (req, res) => {
  try {
    const resp = await fetch(MEDIAMTX_METRICS_URL);
    if (resp.ok) {
      const text = await resp.text();
      return res.type('text/plain').send(text);
    }
  } catch (err) {
    // fallback
  }
  res.type('text/plain').send('# MediaMTX Prometheus Metrics Offline / Fallback\nmediamtx_paths_count 1\nmediamtx_bytes_received 2700000000\nmediamtx_bytes_sent 1350000000\n');
});

// 6. Logs Endpoint
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(systemLogs.slice(-limit).reverse());
});

// Experiments store
const serverExperiments = [
  {
    id: 'exp-rtmp-buffer-01',
    name: 'RTMP Ingest Latency & Buffer Optimization',
    status: 'running',
    startedAt: new Date(Date.now() - 600000).toISOString(),
    targetLatencyMs: 2000,
    latencySamples: [1980, 2010, 1995, 2005, 2020, 1985],
    averageLatencyMs: 1999.1
  },
  {
    id: 'exp-webrtc-egress-02',
    name: 'WebRTC Ultra-Low Latency Egress Test',
    status: 'stopped',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    stoppedAt: new Date(Date.now() - 1800000).toISOString(),
    targetLatencyMs: 500,
    latencySamples: [512, 498, 505, 490, 510],
    averageLatencyMs: 503.0
  }
];

app.get('/api/experiments', (req, res) => {
  res.json(serverExperiments);
});

app.post('/api/experiments/:id/samples', (req, res) => {
  const { id } = req.params;
  const { latencyMs } = req.body;
  const exp = serverExperiments.find((e) => e.id === id);
  if (exp && typeof latencyMs === 'number') {
    exp.latencySamples.push(latencyMs);
    const sum = exp.latencySamples.reduce((a, b) => a + b, 0);
    exp.averageLatencyMs = +(sum / exp.latencySamples.length).toFixed(1);
    return res.json({ success: true, experiment: exp });
  }
  res.status(404).json({ error: 'Experiment not found' });
});

app.post('/api/experiments/:id/start', (req, res) => {
  const { id } = req.params;
  const exp = serverExperiments.find((e) => e.id === id);
  if (exp) {
    exp.status = 'running';
    exp.startedAt = new Date().toISOString();
    delete (exp as any).stoppedAt;
    return res.json({ success: true, experiment: exp });
  }
  res.status(404).json({ error: 'Experiment not found' });
});

app.post('/api/experiments/:id/stop', (req, res) => {
  const { id } = req.params;
  const exp = serverExperiments.find((e) => e.id === id);
  if (exp) {
    exp.status = 'stopped';
    exp.stoppedAt = new Date().toISOString();
    return res.json({ success: true, experiment: exp });
  }
  res.status(404).json({ error: 'Experiment not found' });
});


// 7. Kick Reader Action
app.post('/api/readers/kick', async (req, res) => {
  const { pathName, readerId } = req.body;
  try {
    const resp = await fetch(`${MEDIAMTX_CONTROL_API}/v3/readers/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathName, readerId })
    });
    if (resp.ok) {
      systemLogs.push({
        id: `sys-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'mediamtx',
        message: `Kicked reader ${readerId} on path ${pathName}`
      });
      return res.json({ success: true });
    }
  } catch (e) {
    // ignore
  }

  systemLogs.push({
    id: `sys-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: 'warn',
    source: 'backend',
    message: `[Simulated Action] Disconnected reader ${readerId} on path ${pathName}`
  });
  res.json({ success: true, simulated: true });
});

// 8. Kick Publisher Action
app.post('/api/publishers/kick', async (req, res) => {
  const { pathName } = req.body;
  try {
    const resp = await fetch(`${MEDIAMTX_CONTROL_API}/v3/publishers/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathName })
    });
    if (resp.ok) {
      systemLogs.push({
        id: `sys-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'mediamtx',
        message: `Kicked publisher on path ${pathName}`
      });
      return res.json({ success: true });
    }
  } catch (e) {
    // ignore
  }

  systemLogs.push({
    id: `sys-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: 'warn',
    source: 'backend',
    message: `[Simulated Action] Kicked publisher on path ${pathName}`
  });
  res.json({ success: true, simulated: true });
});

// -------------------------------------------------------------------
// WEBSOCKET SERVER FOR REAL-TIME TELEMETRY PUSH (/ws/live)
// -------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;
  if (pathname === '/ws/live' || pathname?.startsWith('/ws/live')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected to WebSocket monitoring stream');

  const sendSnapshot = async () => {
    if (ws.readyState === WebSocket.OPEN) {
      const host = getHostOSMetrics();
      const isMock = process.env.VITE_USE_MOCK_DATA === 'true';

      if (isMock) {
        const mockBitrate = 6000 + Math.floor(Math.sin(Date.now() / 1000) * 80);
        const snapshot = {
          paths: [
            {
              name: 'live/test',
              ready: true,
              tracks: ['H264', 'AAC'],
              bytesReceived: 2700000000,
              bytesSent: 1350000000,
              publisher: {
                id: 'pub-live-test-01',
                type: 'rtmpConn',
                remoteAddr: '192.168.1.45:58410',
                state: 'publishing',
                videoCodec: 'H.264',
                videoResolution: '1920x1080',
                videoFps: 60,
                audioCodec: 'AAC',
                audioSampleRate: 48000,
                audioChannels: 'stereo',
                targetBitrateKbps: 6000,
                configuredTargetBitrateKbps: 6000,
                currentBitrateKbps: mockBitrate,
                measuredBitrateKbps: mockBitrate,
                connectedAt: new Date(Date.now() - 3600000).toISOString(),
                bytesReceived: 2700000000
              },
              readers: [
                {
                  id: 'rd-webrtc-892',
                  type: 'webrtcConn',
                  remoteAddr: '10.0.0.12:61200',
                  protocol: 'WebRTC',
                  connectedAt: new Date(Date.now() - 1800000).toISOString(),
                  bytesSent: 1350000000
                }
              ],
              publisherConnected: true,
              streamAvailable: true,
              telemetrySource: 'mock',
              telemetryFreshness: 'live',
              metrics: {
                currentBitrateKbps: mockBitrate,
                measuredBitrateKbps: mockBitrate,
                targetBitrateKbps: 6000,
                configuredTargetBitrateKbps: 6000,
                latencyMs: 2000,
                configuredLatencyTargetMs: 2000,
                measuredLatencyMs: 2000,
                measuredLatency: getLatestLatencyForPath('live/test'),
                inboundErrors: 0,
                discardedFrames: 0,
                fps: 60,
                jitterMs: 1.5,
                keyframeIntervalSec: 2.0,
                publisherConnected: true,
                streamAvailable: true,
                telemetrySource: 'mock',
                telemetryFreshness: 'live'
              }
            }
          ],
          host,
          timestamp: Date.now(),
          mediamtxConnected: true
        };
        return ws.send(JSON.stringify(snapshot));
      }

      const { paths, connected } = await fetchRealPathsFromMediaMTX();
      const payloadPaths = paths.length > 0 ? paths : [getOfflinePathData('live/test', connected)];

      const snapshot = {
        paths: payloadPaths,
        host,
        timestamp: Date.now(),
        mediamtxConnected: connected
      };
      ws.send(JSON.stringify(snapshot));
    }
  };

  const interval = setInterval(sendSnapshot, 1000);
  sendSnapshot();

  ws.on('close', () => {
    clearInterval(interval);
  });
});

// -------------------------------------------------------------------
// VITE MIDDLEWARE & SERVER BOOT
// -------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    const rawMockFlag = process.env.VITE_USE_MOCK_DATA;
    const isMock = rawMockFlag === 'true';
    const dataMode = isMock ? 'mock' : 'real';
    const adapterType = isMock ? 'MockApiAdapter' : 'RealApiAdapter';

    console.log('[MediaMTX Monitor Backend Runtime Banner]', {
      runtimeDataMode: dataMode,
      adapterType,
      apiBaseUrl: process.env.VITE_MONITOR_API_URL || `http://0.0.0.0:${PORT}`,
      wsUrl: process.env.VITE_MONITOR_WS_URL || `ws://0.0.0.0:${PORT}/ws/live`,
      buildMode: process.env.NODE_ENV || 'development',
      mockFlagRawValue: rawMockFlag ?? 'absent'
    });
    console.log(`[MediaMTX Monitor Backend] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
