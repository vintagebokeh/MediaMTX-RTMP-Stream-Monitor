import { AppEnv, ConnectionConfig } from '../../types';
import { IMonitorApiAdapter } from './IMonitorApiAdapter';
import { MockApiAdapter } from './MockApiAdapter';
import { RealApiAdapter } from './RealApiAdapter';

const STORAGE_KEY = 'mediamtx_monitor_config';

export function getDefaultConfig(): ConnectionConfig {
  // Read from Vite environment variables as per specification
  const envApiUrl = import.meta.env.VITE_MONITOR_API_URL || '';
  const envWsUrl = import.meta.env.VITE_MONITOR_WS_URL || '';
  const envAppEnv = (import.meta.env.VITE_APP_ENV as AppEnv) || 'local';
  
  // Default to mock mode if VITE_USE_MOCK_DATA is "true" or if running in AI Studio without external API
  const mockFlag = import.meta.env.VITE_USE_MOCK_DATA;
  const useMockData = mockFlag === undefined ? true : mockFlag === 'true';

  // Check localStorage for user runtime overrides
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        apiUrl: parsed.apiUrl ?? envApiUrl,
        wsUrl: parsed.wsUrl ?? envWsUrl,
        appEnv: parsed.appEnv ?? envAppEnv,
        useMockData: parsed.useMockData ?? useMockData
      };
    }
  } catch (e) {
    // fallback
  }

  return {
    apiUrl: envApiUrl,
    wsUrl: envWsUrl,
    appEnv: envAppEnv,
    useMockData
  };
}

export function saveConfig(config: ConnectionConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save monitor config:', e);
  }
}

export function createApiAdapter(overrideConfig?: ConnectionConfig): IMonitorApiAdapter {
  const config = overrideConfig || getDefaultConfig();
  if (config.useMockData) {
    return new MockApiAdapter(config);
  } else {
    return new RealApiAdapter(config);
  }
}
