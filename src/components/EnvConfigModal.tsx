import React, { useState, useRef, useEffect } from 'react';
import { X, Save, Copy, Check, Info, Server, Wifi, ShieldAlert } from 'lucide-react';
import { AppEnv, ConnectionConfig } from '../types';

interface EnvConfigModalProps {
  isOpen: boolean;
  config: ConnectionConfig;
  onClose: () => void;
  onSave: (newConfig: ConnectionConfig) => void;
  theme?: 'light' | 'dark';
}

export const EnvConfigModal: React.FC<EnvConfigModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
  theme = 'light'
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  const currentHost = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
  const currentProtocol = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'https' : 'http';
  const currentWsProtocol = currentProtocol === 'https' ? 'wss' : 'ws';

  const [appEnv, setAppEnv] = useState<AppEnv>(config.appEnv);
  const [apiUrl, setApiUrl] = useState<string>(config.apiUrl || `${currentProtocol}://${currentHost}:8090`);
  const [wsUrl, setWsUrl] = useState<string>(config.wsUrl || `${currentWsProtocol}://${currentHost}:8090/ws/live`);
  const [useMockData, setUseMockData] = useState<boolean>(config.useMockData);
  const [copiedEnv, setCopiedEnv] = useState<boolean>(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  const applyPreset = (preset: AppEnv) => {
    setAppEnv(preset);
    switch (preset) {
      case 'local':
        setApiUrl(`${currentProtocol}://localhost:8090`);
        setWsUrl(`${currentWsProtocol}://localhost:8090/ws/live`);
        break;
      case 'lan':
        setApiUrl(`${currentProtocol}://${currentHost}:8090`);
        setWsUrl(`${currentWsProtocol}://${currentHost}:8090/ws/live`);
        break;
      case 'remote':
        setApiUrl('https://rtmp-monitor-api.example.com');
        setWsUrl('wss://rtmp-monitor-api.example.com/ws/live');
        break;
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      appEnv,
      apiUrl,
      wsUrl,
      useMockData
    });
    onClose();
  };

  const envSnippet = `# MediaMTX RTMP Stream Monitor Environment Config
VITE_APP_ENV="${appEnv}"
VITE_MONITOR_API_URL="${apiUrl}"
VITE_MONITOR_WS_URL="${wsUrl}"
VITE_USE_MOCK_DATA="${useMockData}"
`;

  const copySnippet = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopiedEnv(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopiedEnv(false);
      copyTimerRef.current = null;
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
      <div className={`border rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden font-sans ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-mono">
                Deployment & Endpoint Architecture Settings
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Configure frontend environment variables and backend endpoints
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          
          {/* Mock Mode Toggle */}
          <div className={`border rounded-lg p-3.5 flex items-start justify-between gap-4 ${
            isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Standalone Mock-Data Mode</span>
                <span className="px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded font-mono font-bold">
                  VITE_USE_MOCK_DATA
                </span>
              </div>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed font-mono">
                Simulates 1 path (<code className="px-1 rounded bg-amber-200 dark:bg-amber-950/60 font-bold">live/test</code>), 1080p60, 6 Mbps target bitrate, ~2.0s target buffer.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={useMockData}
                onChange={(e) => setUseMockData(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
            </label>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className={`text-xs font-semibold block ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Supported Environments Preset (VITE_APP_ENV)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('local')}
                className={`p-2.5 rounded-lg border text-xs font-semibold transition text-left space-y-0.5 ${
                  appEnv === 'local'
                    ? isDark
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-indigo-50 border-indigo-500 text-indigo-900'
                    : isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="font-bold">1. Local</div>
                <div className="text-[10px] font-mono opacity-75">http://localhost:8090</div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('lan')}
                className={`p-2.5 rounded-lg border text-xs font-semibold transition text-left space-y-0.5 ${
                  appEnv === 'lan'
                    ? isDark
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-indigo-50 border-indigo-500 text-indigo-900'
                    : isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="font-bold">2. LAN Network</div>
                <div className="text-[10px] font-mono opacity-75">http://{currentHost}:8090</div>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('remote')}
                className={`p-2.5 rounded-lg border text-xs font-semibold transition text-left space-y-0.5 ${
                  appEnv === 'remote'
                    ? isDark
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-indigo-50 border-indigo-500 text-indigo-900'
                    : isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="font-bold">3. Remote Domain</div>
                <div className="text-[10px] font-mono opacity-75">https://rtmp-monitor...</div>
              </button>
            </div>
          </div>

          {/* VITE_MONITOR_API_URL */}
          <div className="space-y-1">
            <label className={`text-xs font-semibold flex items-center justify-between ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}>
              <span>VITE_MONITOR_API_URL</span>
              <span className="text-[10px] font-mono text-slate-500">Monitoring Backend API</span>
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={`http://${currentHost}:8090`}
              className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500 ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          {/* VITE_MONITOR_WS_URL */}
          <div className="space-y-1">
            <label className={`text-xs font-semibold flex items-center justify-between ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}>
              <span>VITE_MONITOR_WS_URL</span>
              <span className="text-[10px] font-mono text-slate-500">WebSocket Live Telemetry</span>
            </label>
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder={`ws://${currentHost}:8090/ws/live`}
              className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500 ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          {/* Architecture Reminder */}
          <div className={`p-3 border rounded-lg flex items-start space-x-2.5 text-xs ${
            isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Security Architecture Notice:</strong> The React frontend calls <em>only</em> the Monitoring Backend API. It never calls MediaMTX ports 9997 or 9998 directly from the browser.
            </p>
          </div>

          {/* .env Export Block */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Generated .env Configuration</span>
              <button
                type="button"
                onClick={copySnippet}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
              >
                {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedEnv ? 'Copied' : 'Copy .env'}</span>
              </button>
            </div>
            <pre className={`border rounded-lg p-3 text-[11px] font-mono overflow-x-auto ${
              isDark ? 'bg-slate-950 border-slate-800 text-emerald-400' : 'bg-slate-900 border-slate-800 text-emerald-400'
            }`}>
              {envSnippet}
            </pre>
          </div>

          {/* Actions */}
          <div className={`flex items-center justify-end space-x-2 pt-3 border-t ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Apply Configuration</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

