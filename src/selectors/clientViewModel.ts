import { StreamPath, HealthResponse, RuntimeConfig, ClientDashboardViewModel } from '../types';

export function selectClientViewModel(
  paths: StreamPath[],
  health: HealthResponse | null,
  config: RuntimeConfig | null
): ClientDashboardViewModel {
  const activePath = paths.find(p => p.publisher !== null) || paths[0] || null;
  const publisher = activePath?.publisher || null;
  const isPublisherConnected = publisher !== null;

  let status: 'online' | 'warning' | 'offline' = 'offline';
  let publicStatusMessage = 'Stream temporarily unavailable';
  let qualityLabel: 'Excellent' | 'Good' | 'Degraded' | 'Unavailable' = 'Unavailable';

  if (isPublisherConnected) {
    const inboundErrors = activePath?.metrics?.inboundErrors || 0;
    if (inboundErrors > 0) {
      status = 'warning';
      publicStatusMessage = 'Degraded performance';
      qualityLabel = 'Degraded';
    } else {
      status = 'online';
      publicStatusMessage = 'Service operating normally';
      qualityLabel = (activePath?.metrics?.currentBitrateKbps || 0) >= 5000 ? 'Excellent' : 'Good';
    }
  } else if (health?.mediamtxConnected) {
    status = 'offline';
    publicStatusMessage = 'Stream temporarily unavailable';
    qualityLabel = 'Unavailable';
  }

  // Uptime calculation
  let uptimeSeconds: number | null = null;
  let startTime: string | null = null;
  if (publisher?.connectedAt) {
    startTime = publisher.connectedAt;
    const startMs = new Date(publisher.connectedAt).getTime();
    if (!isNaN(startMs)) {
      uptimeSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    }
  }

  const previewUrl = config?.playback?.webrtcUrl || config?.playback?.hlsUrl || null;

  return {
    serviceName: 'Live Broadcast Stream',
    status,
    streamPath: activePath?.name || null,
    uptimeSeconds,
    previewUrl,
    lastUpdated: new Date().toLocaleTimeString(),
    publicStatusMessage,
    qualityLabel,
    viewerCount: activePath?.readers?.length ?? 0,
    startTime
  };
}
