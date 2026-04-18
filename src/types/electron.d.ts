// Type declaration for Electron bridge exposed via preload.cjs
export {};

declare global {
  interface Window {
    rubix?: {
      isElectron: true;
      launchGame: (target: string) => Promise<{ ok: boolean; error?: string; method?: string }>;
      pickExecutable: () => Promise<string | null>;
    };
  }
}
