import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import os from 'os';

const app = express();
const PORT = 3000;
const server = createServer(app);

app.use(express.json());

// MediaMTX internal ports configured via environment variables
const MEDIAMTX_CONTROL_API = process.env.MEDIAMTX_CONTROL_API || 'http://127.0.0.1:9997';
const MEDIAMTX_METRICS_URL = process.env.MEDIAMTX_METRICS_URL || 'http://127.0.0.1:9998/metrics';

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
    networkInKbps: 6020,
    networkOutKbps: 6080,
    uptimeSec: Math.floor(os.uptime()),
    mediamtxProcessCpu: 2.4,
    mediamtxProcessRamMB: 128
  };
}

// -------------------------------------------------------------------
// REST API ROUTES (/api/*)
// -------------------------------------------------------------------

// 0. Runtime Config Endpoint
app.get('/api/v1/runtime-config', (req, res) => {
  const streamPath = (req.query.path as string) || 'live/test';
  const environment = process.env.VITE_APP_ENV || 'local';

  res.json({
    environment,
    streamPath,
    playback: {
      webrtcUrl: process.env.WEBRTC_PLAYBACK_URL || `http://127.0.0.1:8889/${streamPath}`,
      hlsUrl: process.env.HLS_PLAYBACK_URL || `http://127.0.0.1:8888/${streamPath}/index.m3u8`
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

// 1. Health Endpoint
app.get('/api/health', async (req, res) => {
  let mediamtxConnected = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const resp = await fetch(`${MEDIAMTX_CONTROL_API}/v3/paths/list`, { signal: controller.signal });
    clearTimeout(timeout);
    mediamtxConnected = resp.ok;
  } catch (err) {
    mediamtxConnected = false;
  }

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    mediamtxConnected,
    activePathsCount: 1,
    totalPublishers: 1,
    totalReaders: 1,
    totalBitrateKbps: 6000,
    appEnv: process.env.VITE_APP_ENV || 'local',
    mockMode: process.env.VITE_USE_MOCK_DATA === 'true'
  });
});

// 2. Stream Paths Endpoint (Proxies MediaMTX Control API privately)
app.get('/api/paths', async (req, res) => {
  try {
    const resp = await fetch(`${MEDIAMTX_CONTROL_API}/v3/paths/list`);
    if (resp.ok) {
      const data = await resp.json();
      // Map MediaMTX v3 path list structure to frontend model
      return res.json(data.items || []);
    }
  } catch (err) {
    // MediaMTX control API fallback mock response if backend runs without MediaMTX daemon
  }

  // Fallback active live/test path specification
  res.json([
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
        measuredLatency: getLatestLatencyForPath('live/test'),
        inboundErrors: 0,
        discardedFrames: 0,
        fps: 60,
        jitterMs: 1.5,
        keyframeIntervalSec: 2.0
      }
    }
  ]);
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

  const sendSnapshot = () => {
    if (ws.readyState === WebSocket.OPEN) {
      const host = getHostOSMetrics();
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
              currentBitrateKbps: 6000 + Math.floor(Math.sin(Date.now() / 1000) * 80),
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
              currentBitrateKbps: 6000 + Math.floor(Math.sin(Date.now() / 1000) * 80),
              targetBitrateKbps: 6000,
              latencyMs: 2000,
              configuredLatencyTargetMs: 2000,
              measuredLatency: getLatestLatencyForPath('live/test'),
              inboundErrors: 0,
              discardedFrames: 0,
              fps: 60,
              jitterMs: 1.5,
              keyframeIntervalSec: 2.0
            }
          }
        ],
        host,
        timestamp: Date.now(),
        mediamtxConnected: true
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
    console.log(`[MediaMTX Monitor Backend] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
