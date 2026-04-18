const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    title: "RUBIX Launcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// Launch a game by path/URI
ipcMain.handle("launch-game", async (_evt, target) => {
  if (!target || typeof target !== "string") {
    return { ok: false, error: "No launch target provided" };
  }

  const trimmed = target.trim();

  // URL schemes (steam://, epicgames://, https://, etc.) open via OS handler
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      await shell.openExternal(trimmed);
      return { ok: true, method: "url" };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // Local executable / file path
  try {
    // shell.openPath handles .exe, .app, .sh and respects OS associations
    const errorMsg = await shell.openPath(trimmed);
    if (errorMsg) {
      // Fallback: spawn detached
      const child = spawn(trimmed, [], { detached: true, stdio: "ignore" });
      child.unref();
      return { ok: true, method: "spawn" };
    }
    return { ok: true, method: "openPath" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Native file picker for selecting a game executable
ipcMain.handle("pick-executable", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select game executable",
    properties: ["openFile"],
    filters: [
      { name: "Executables", extensions: ["exe", "app", "sh", "bat", "cmd", "AppImage"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
