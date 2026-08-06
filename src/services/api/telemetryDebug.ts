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

export interface MemoryDiagnosticSample {
  timestamp: string;
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  activeVideoElements: number;
  activeIframeElements: number;
  activeCanvasElements: number;
  activeAdapterInstanceId?: string;
  activeSubscriberCount: number;
  activeTransportType: TelemetrySource;
  activeAnimationLoopCount: number;
}

let activeAnimationLoopCount = 0;

export function incrementAnimationLoopCount(): number {
  activeAnimationLoopCount++;
  return activeAnimationLoopCount;
}

export function decrementAnimationLoopCount(): number {
  activeAnimationLoopCount = Math.max(0, activeAnimationLoopCount - 1);
  return activeAnimationLoopCount;
}

export function getAnimationLoopCount(): number {
  return activeAnimationLoopCount;
}

export function resetAnimationLoopCount(): void {
  activeAnimationLoopCount = 0;
}

const memoryTrend: MemoryDiagnosticSample[] = [];

export function addMemoryDiagnosticSample(sample: MemoryDiagnosticSample): MemoryDiagnosticSample[] {
  memoryTrend.push(sample);
  if (memoryTrend.length > 60) {
    memoryTrend.shift();
  }
  return memoryTrend;
}

export function getMemoryTrend(): MemoryDiagnosticSample[] {
  return [...memoryTrend];
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

