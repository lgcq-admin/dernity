import path from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { loadShellEnv } from "./env";
import { handleFileScheme, registerFileScheme } from "./files";
import { startHealthMonitor } from "./health";
import { resumeGenerations } from "./generations";
import { closeTunnels } from "./hosts";
import { registerIpc } from "./ipc";
import { startMachineTracker } from "./machines";
import { loadBestiary, watchBestiary } from "./bestiary";
import { loadModels, watchModels } from "./models";
import { killAllTerminals } from "./terminals";
import { setupWorkspace } from "./workspace";

registerFileScheme();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Dernity",
    backgroundColor: "#060806",
    icon: path.join(app.getAppPath(), "resources", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links open in the system browser; the app window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

if (!app.requestSingleInstanceLock()) app.quit();

app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  await loadShellEnv();
  setupWorkspace();
  loadModels();
  watchModels();
  loadBestiary();
  watchBestiary();
  handleFileScheme();
  registerIpc();
  resumeGenerations();
  startHealthMonitor();
  startMachineTracker();
  createWindow();
});

app.on("window-all-closed", () => {
  killAllTerminals();
  closeTunnels();
  app.quit();
});
