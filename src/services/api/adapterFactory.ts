import { AppEnv, ConnectionConfig, resolveRuntimeDataMode } from '../../types';
import { IMonitorApiAdapter } from './IMonitorApiAdapter';
import { MockApiAdapter } from './MockApiAdapter';
import { RealApiAdapter } from './RealApiAdapter';

const STORAGE_KEY = 'mediamtx_monitor_config';

let hasLoggedStartupBanner = false;

function getEnvVar(key: string): string | undefined {
  if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

export function getDefaultConfig(): ConnectionConfig {
  const envApiUrl = getEnvVar('VITE_MONITOR_API_URL') || '';
  const envWsUrl = getEnvVar('VITE_MONITOR_WS_URL') || '';
  const envAppEnv = (getEnvVar('VITE_APP_ENV') as AppEnv) || 'local';
  
  // Resolve mode strictly from VITE_USE_MOCK_DATA environment variable
  const rawMockFlag = getEnvVar('VITE_USE_MOCK_DATA');
  const dataMode = resolveRuntimeDataMode(rawMockFlag);
  const useMockData = dataMode === 'mock';

  let apiUrl = envApiUrl;
  let wsUrl = envWsUrl;
  let appEnv = envAppEnv;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.apiUrl) apiUrl = parsed.apiUrl;
      if (parsed.wsUrl) wsUrl = parsed.wsUrl;
      if (parsed.appEnv) appEnv = parsed.appEnv;
    }
  } catch (e) {
    // fallback
  }

  return {
    apiUrl,
    wsUrl,
    appEnv,
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
  const rawMockFlag = getEnvVar('VITE_USE_MOCK_DATA');
  const dataMode = resolveRuntimeDataMode(rawMockFlag);
  const adapterType = config.useMockData ? 'MockApiAdapter' : 'RealApiAdapter';

  if (!hasLoggedStartupBanner) {
    hasLoggedStartupBanner = true;
    console.log('[Runtime Mode Startup Banner]', {
      runtimeDataMode: dataMode,
      adapterType,
      apiBaseUrl: config.apiUrl || '(relative / api)',
      wsUrl: config.wsUrl || '(auto ws)',
      buildMode: getEnvVar('MODE') || 'production',
      mockFlagRawValue: rawMockFlag ?? 'absent'
    });
  }

  if (config.useMockData) {
    return new MockApiAdapter(config);
  } else {
    return new RealApiAdapter(config);
  }
}
