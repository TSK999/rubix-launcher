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
});
