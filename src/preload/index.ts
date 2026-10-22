// Typed bridge to main. No logic here: each call maps to one IPC channel.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { DernityApi } from "@shared/types";

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as T));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const invoke = ipcRenderer.invoke.bind(ipcRenderer);

const api: DernityApi = {
  app: {
    info: () => invoke("app:info"),
    openPath: (target) => invoke("app:openPath", target),
    showGeneration: (id) => invoke("app:showGeneration", id),
  },
  models: {
    list: () => invoke("models:list"),
    health: (id) => invoke("models:health", id),
    healthAll: () => invoke("models:healthAll"),
    onChanged: (cb) => on("models:changed", cb),
    onHealth: (cb) => on("models:healthChanged", cb),
  },
  chats: {
    list: () => invoke("chats:list"),
    get: (id) => invoke("chats:get", id),
    save: (chat) => invoke("chats:save", chat),
    remove: (id) => invoke("chats:remove", id),
    attach: (file) => invoke("chats:attach", file),
    stream: (req) => invoke("chats:stream", req),
    abort: (requestId) => invoke("chats:abort", requestId),
    onDelta: (cb) => on("chats:delta", cb),
  },
  generations: {
    list: () => invoke("generations:list"),
    submit: (req) => invoke("generations:submit", req),
    remove: (id) => invoke("generations:remove", id),
    onUpdate: (cb) => on("generations:update", cb),
  },
  machines: {
    list: () => invoke("machines:list"),
    history: () => invoke("machines:history"),
  },
  secrets: {
    status: () => invoke("secrets:status"),
    set: (provider, key) => invoke("secrets:set", provider, key),
  },
  terminals: {
    detect: () => invoke("terminals:detect"),
    create: (command, prompt) => invoke("terminals:create", command, prompt),
    write: (id, data) => ipcRenderer.send("terminals:write", id, data),
    resize: (id, cols, rows) => ipcRenderer.send("terminals:resize", id, cols, rows),
    kill: (id) => ipcRenderer.send("terminals:kill", id),
    onData: (cb) => on("terminals:data", cb),
    onExit: (cb) => on("terminals:exit", cb),
  },
};

contextBridge.exposeInMainWorld("dernity", api);
