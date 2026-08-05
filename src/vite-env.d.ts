/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MONITOR_API_URL: string;
  readonly VITE_MONITOR_WS_URL: string;
  readonly VITE_APP_ENV: string;
  readonly VITE_USE_MOCK_DATA: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
