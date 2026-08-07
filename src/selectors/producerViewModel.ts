import { StreamPath, HealthResponse, RuntimeConfig, ProducerDashboardViewModel } from '../types';

export function selectProducerViewModel(
  paths: StreamPath[],
  health: HealthResponse | null,
  config: RuntimeConfig | null
): ProducerDashboardViewModel {
  const activePath = paths.find(p => p.publisher !== null || p.normalizedSnapshot?.publisher?.connected) || paths[0] || null;
  const publisher = activePath?.publisher || null;
  const snap = activePath?.normalizedSnapshot;
  const isPublisherConnected = snap ? snap.publisher.connected : (publisher !== null);

  let status: 'online' | 'warning' | 'offline' = 'offline';
  if (isPublisherConnected) {
    status = (activePath?.metrics?.inboundErrors || 0) > 0 ? 'warning' : 'online';
  } else if (health?.mediamtxConnected) {
    status = 'warning'; // Server ready, waiting for stream ingest
  }

  // Uptime calculation in seconds
  let uptimeSeconds: number | null = null;
  if (publisher?.connectedAt) {
    const start = new Date(publisher.connectedAt).getTime();
    if (!isNaN(start)) {
      uptimeSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
    }
  }

  const previewUrl = config?.playback?.webrtcUrl || config?.playback?.hlsUrl || null;

  return {
    serviceName: 'Live Video Ingest & Production',
    status,
    streamPath: activePath?.name || config?.streamPath || 'live/test',
    uptimeSeconds,
    previewUrl,
    lastUpdated: new Date().toLocaleTimeString(),
    resolution: publisher?.videoResolution || (activePath?.tracks?.length ? '1080p60' : '1080p60 (Estimated)'),
    frameRate: publisher?.videoFps || activePath?.metrics?.fps || 60,
    audioDetected: Boolean(publisher?.audioCodec && publisher.audioCodec !== 'None' && publisher.audioCodec !== ''),
    latencyMs: activePath?.metrics?.measuredLatency?.valueMs ?? activePath?.metrics?.latencyMs ?? 2000,
    publisherConnected: isPublisherConnected,
    readerCount: activePath?.readers?.length || 0
  };
}
