export const isTelemetryDebug =
  typeof import.meta !== 'undefined' &&
  Boolean(import.meta.env?.DEV) &&
  import.meta.env?.VITE_TELEMETRY_DEBUG === 'true';

export type TelemetrySource = 'mock' | 'websocket' | 'http-polling' | 'unknown';

export interface TelemetryHeartbeatPayload {
  source: TelemetrySource;
  pollAt?: string;
  receivedAt: string;
  stateUpdatedAt?: string;
  pathCount: number;
  sampleCount?: number;
  adapterInstanceId?: string;
}

export function logTelemetryLifecycle(
  event:
    | 'adapter created'
    | 'subscriber added'
    | 'subscriber removed'
    | 'transport started'
    | 'transport fallback'
    | 'transport stopped'
    | 'adapter disposed',
  adapterInstanceId: string,
  details?: Record<string, unknown>
) {
  if (!isTelemetryDebug) return;
  const detailStr = details ? ` | ${JSON.stringify(details)}` : '';
  console.log(`[Lifecycle] [${adapterInstanceId}] ${event}${detailStr}`);
}

export function logTelemetryHeartbeat(payload: TelemetryHeartbeatPayload) {
  if (!isTelemetryDebug) return;
  console.log('[Telemetry Heartbeat]', payload);
}
