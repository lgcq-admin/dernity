// IPC handlers. Every input from the renderer is validated here; the renderer is treated as untrusted.
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { z } from "zod";
import { ChatSchema, ChatStreamRequestSchema, GenerationRequestSchema, IncomingFileSchema } from "@shared/types";
import { listBestiary, onBestiaryChanged } from "./bestiary";
import { abortChat, attachFile, getChat, listChats, removeChat, saveChat, streamChat } from "./chats";
import { generationDir, listGenerations, onGenerationUpdate, removeGeneration, submitGeneration } from "./generations";
import { checkHealth, onHealth } from "./health";
import { allHealth, listModels, onModelsChanged } from "./models";
import { HOME, LIBRARY, WORKSPACE } from "./paths";
import { pollMachines, readHistory } from "./machines";
import { keyStatus, setKey } from "./secrets";
import { createTerminal, detectClis, killTerminal, resizeTerminal, writeTerminal } from "./terminals";

const id = z.string().min(1).max(200);
const secretName = z.enum(["runpod", "vast", "huggingface"]);

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, ...args);
}

// ipcMain.handle with argument validation.
function handle<A extends z.ZodTypeAny[]>(channel: string, schemas: [...A], fn: (...args: { [K in keyof A]: z.infer<A[K]> }) => unknown) {
  ipcMain.handle(channel, (_e, ...raw: unknown[]) => {
    const args = schemas.map((s, i) => s.parse(raw[i])) as { [K in keyof A]: z.infer<A[K]> };
    return fn(...args);
  });
}

export function registerIpc(): void {
  handle("app:info", [], () => ({
    version: app.getVersion(),
    platform: process.platform,
    home: HOME,
    workspace: WORKSPACE,
    library: LIBRARY,
  }));
  handle("app:openPath", [z.enum(["workspace", "library", "home"])], (target) =>
    shell.openPath({ workspace: WORKSPACE, library: LIBRARY, home: HOME }[target]).then(() => undefined),
  );
  handle("app:showGeneration", [id], (gid) => shell.openPath(generationDir(gid)).then(() => undefined));

  handle("models:list", [], () => listModels());
  handle("models:health", [id], (mid) => checkHealth(mid));
  handle("models:healthAll", [], () => allHealth());
  onHealth((mid, h) => broadcast("models:healthChanged", mid, h));
  onModelsChanged((entries) => broadcast("models:changed", entries));

  handle("bestiary:list", [], () => listBestiary());
  onBestiaryChanged((files) => broadcast("bestiary:changed", files));

  handle("chats:list", [], () => listChats());
  handle("chats:get", [id], (cid) => getChat(cid));
  handle("chats:save", [ChatSchema], (chat) => saveChat(chat));
  handle("chats:remove", [id], (cid) => removeChat(cid));
  handle("chats:attach", [IncomingFileSchema], (file) => attachFile(file));
  handle("chats:stream", [ChatStreamRequestSchema], (req) => {
    void streamChat(req, (d) => broadcast("chats:delta", d));
  });
  handle("chats:abort", [id], (rid) => abortChat(rid));

  handle("generations:list", [], () => listGenerations());
  handle("generations:submit", [GenerationRequestSchema], (req) => submitGeneration(req));
  handle("generations:remove", [id], (gid) => removeGeneration(gid));
  onGenerationUpdate((g) => broadcast("generations:update", g));

  handle("machines:list", [], () => pollMachines());
  handle("machines:history", [], () => readHistory());

  handle("secrets:status", [], () => keyStatus());
  handle("secrets:set", [secretName, z.string().max(500).nullable()], (name, key) => setKey(name, key));

  handle("terminals:detect", [], () => detectClis());
  handle("terminals:create", [z.string().optional(), z.string().max(2000).optional()], (command, prompt) =>
    createTerminal(
      command,
      prompt,
      (tid, data) => broadcast("terminals:data", tid, data),
      (tid, code) => broadcast("terminals:exit", tid, code),
    ),
  );
  ipcMain.on("terminals:write", (_e, tid: unknown, data: unknown) => {
    if (typeof tid === "string" && typeof data === "string") writeTerminal(tid, data);
  });
  ipcMain.on("terminals:resize", (_e, tid: unknown, cols: unknown, rows: unknown) => {
    if (typeof tid === "string" && typeof cols === "number" && typeof rows === "number") resizeTerminal(tid, cols, rows);
  });
  ipcMain.on("terminals:kill", (_e, tid: unknown) => {
    if (typeof tid === "string") killTerminal(tid);
  });
}
