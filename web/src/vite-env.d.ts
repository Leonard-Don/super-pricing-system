/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_API_TIMEOUT_ANALYSIS?: string;
  readonly VITE_API_TIMEOUT_STANDARD?: string;
  readonly VITE_API_TIMEOUT_DASHBOARD?: string;
  readonly VITE_API_TIMEOUT_WORKBENCH?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
