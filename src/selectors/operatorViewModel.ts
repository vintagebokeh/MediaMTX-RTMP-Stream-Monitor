import { StreamPath, HealthResponse, RuntimeConfig } from '../types';

export interface OperatorViewModel {
  serviceName: string;
  status: 'online' | 'warning' | 'offline';
  streamPath: string | null;
  activePathsCount: number;
  mediamtxConnected: boolean;
  totalInboundKbps: number;
  totalOutboundKbps: number;
  lastUpdated: string;
}

export function selectOperatorViewModel(
  paths: StreamPath[],
  health: HealthResponse | null,
  config: RuntimeConfig | null
): OperatorViewModel {
  const activePath = paths.find(p => p.publisher !== null) || paths[0] || null;
  const isConnected = health?.mediamtxConnected ?? false;
  
  let status: 'online' | 'warning' | 'offline' = 'offline';
  if (isConnected && activePath?.publisher) {
    status = activePath.metrics.inboundErrors > 0 ? 'warning' : 'online';
  } else if (isConnected && paths.length > 0) {
    status = 'warning';
  }

  const totalInboundKbps = paths.reduce((acc, p) => acc + (p.metrics?.currentBitrateKbps || 0), 0);
  const totalOutboundKbps = paths.reduce((acc, p) => acc + ((p.readers?.length || 0) * (p.metrics?.currentBitrateKbps || 0)), 0);

  return {
    serviceName: 'NOC Technical Operations',
    status,
    streamPath: activePath?.name || config?.streamPath || null,
    activePathsCount: paths.length,
    mediamtxConnected: isConnected,
    totalInboundKbps,
    totalOutboundKbps,
    lastUpdated: new Date().toLocaleTimeString()
  };
}
