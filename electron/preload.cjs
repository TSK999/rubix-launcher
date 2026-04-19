const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rubix", {
  isElectron: true,
  launchGame: (target) => ipcRenderer.invoke("launch-game", target),
  pickExecutable: () => ipcRenderer.invoke("pick-executable"),
  epic: {
    scanInstalled: () => ipcRenderer.invoke("epic:scan-installed"),
    launch: (payload) => ipcRenderer.invoke("epic:launch", payload),
  },
});
