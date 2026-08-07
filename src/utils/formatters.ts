import { Kbps } from '../types';

export function formatKbps(kbps: Kbps | number | null): string {
  if (kbps === null || kbps === undefined || isNaN(kbps)) {
    return '--';
  }
  return `${kbps} Kbps`;
}

export function formatMbpsFromKbps(kbps: Kbps | number | null): string {
  if (kbps === null || kbps === undefined || isNaN(kbps)) {
    return '--';
  }
  return `${(kbps / 1000).toFixed(2)} Mbps`;
}
