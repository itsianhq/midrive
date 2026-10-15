/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface MidriveConfig {
  apiUrl?: string
}

interface Window {
  __MIDRIVE_CONFIG__?: MidriveConfig
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
