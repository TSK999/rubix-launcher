const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rubix", {
  isElectron: true,
  launchGame: (target) => ipcRenderer.invoke("launch-game", target),
  pickExecutable: () => ipcRenderer.invoke("pick-executable"),
  epic: {
    scanInstalled: () => ipcRenderer.invoke("epic:scan-installed"),
    launch: (payload) => ipcRenderer.invoke("epic:launch", payload),
  },
  ea: {
    scanInstalled: () => ipcRenderer.invoke("ea:scan-installed"),
    launch: (payload) => ipcRenderer.invoke("ea:launch", payload),
  },
  xbox: {
    scanInstalled: () => ipcRenderer.invoke("xbox:scan-installed"),
    launch: (payload) => ipcRenderer.invoke("xbox:launch", payload),
  },
  riot: {
    scanInstalled: () => ipcRenderer.invoke("riot:scan-installed"),
    launch: (payload) => ipcRenderer.invoke("riot:launch", payload),
  },
  screenshots: {
    capture: () => ipcRenderer.invoke("screenshots:capture"),
    onCaptured: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on("screenshots:captured", handler);
      return () => ipcRenderer.removeListener("screenshots:captured", handler);
    },
  },
  clips: {
    setTarget: (target) => ipcRenderer.invoke("clips:set-target", target),
    getSource: () => ipcRenderer.invoke("clips:get-source"),
    listDisplays: () => ipcRenderer.invoke("clips:list-displays"),
    listAudioDevices: () => ipcRenderer.invoke("clips:list-audio-devices"),
    setPreferredDisplay: (displayId) =>
      ipcRenderer.invoke("clips:set-preferred-display", displayId),
    onSaveTrigger: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on("clips:save-trigger", handler);
      return () => ipcRenderer.removeListener("clips:save-trigger", handler);
    },
    ffmpeg: {
      probe: () => ipcRenderer.invoke("clips:ffmpeg-probe"),
      start: (opts) => ipcRenderer.invoke("clips:ffmpeg-start", opts),
      stop: () => ipcRenderer.invoke("clips:ffmpeg-stop"),
      status: () => ipcRenderer.invoke("clips:ffmpeg-status"),
      save: (opts) => ipcRenderer.invoke("clips:ffmpeg-save", opts),
      discard: (p) => ipcRenderer.invoke("clips:ffmpeg-discard", p),
      onStatus: (cb) => {
        const handler = (_evt, data) => cb(data);
        ipcRenderer.on("clips:ffmpeg-status", handler);
        return () => ipcRenderer.removeListener("clips:ffmpeg-status", handler);
      },
    },
  },
  hotkeys: {
    set: (map) => ipcRenderer.invoke("hotkeys:set", map),
    get: () => ipcRenderer.invoke("hotkeys:get"),
    onFired: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on("hotkeys:fired", handler);
      return () => ipcRenderer.removeListener("hotkeys:fired", handler);
    },
  },
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    install: () => ipcRenderer.invoke("updater:install"),
    getVersion: () => ipcRenderer.invoke("updater:get-version"),
    getPendingReleaseNotes: () => ipcRenderer.invoke("updater:get-pending-notes"),
    clearPendingReleaseNotes: () => ipcRenderer.invoke("updater:clear-pending-notes"),
    onStatus: (cb) => {
      const handler = (_evt, data) => cb(data);
      ipcRenderer.on("updater:status", handler);
      return () => ipcRenderer.removeListener("updater:status", handler);
    },
  },
  mods: {
    pickFolder: (gameKey, title, mode) =>
      ipcRenderer.invoke("mods:pick-folder", { gameKey, title, mode }),
    setFolder: (gameKey, path) =>
      ipcRenderer.invoke("mods:set-folder", { gameKey, path }),
    getFolder: (gameKey) => ipcRenderer.invoke("mods:get-folder", { gameKey }),
    listConfigured: () => ipcRenderer.invoke("mods:list-configured"),
    removeFolder: (gameKey) =>
      ipcRenderer.invoke("mods:remove-folder", { gameKey }),
    validatePath: (payload) => ipcRenderer.invoke("mods:validate-path", payload),
    autoDetect: (adapter) => ipcRenderer.invoke("mods:auto-detect", adapter),
    listInstalled: (gameKey) =>
      ipcRenderer.invoke("mods:list-installed", { gameKey }),
    install: (payload) => ipcRenderer.invoke("mods:install", payload),
    uninstall: (gameKey, modId) =>
      ipcRenderer.invoke("mods:uninstall", { gameKey, modId }),
    openFolder: (gameKey) => ipcRenderer.invoke("mods:open-folder", { gameKey }),
  },
});
