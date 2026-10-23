// Where user data lives. Everything Dernity stores is under one folder the user can copy to back up.
import os from "node:os";
import path from "node:path";
import { app } from "electron";

export const HOME = process.env.DERNITY_HOME ? path.resolve(process.env.DERNITY_HOME) : path.join(os.homedir(), "Dernity");
export const WORKSPACE = path.join(HOME, "workspace"); // agent cwd
export const MODELS = path.join(WORKSPACE, "models");
export const WORKFLOWS = path.join(WORKSPACE, "workflows");
export const BESTIARY = path.join(WORKSPACE, "bestiary"); // model guides the agent writes
export const SECRETS = path.join(WORKSPACE, "secrets"); // server tokens the agent creates, one file each
export const STATUS = path.join(WORKSPACE, ".dernity"); // app -> agent feedback: schema, validation, health
export const LIBRARY = path.join(HOME, "library"); // private: never readable by the agent
export const CHATS = path.join(HOME, "chats"); // private
export const CHAT_FILES = path.join(CHATS, "files");

// Template shipped with the app: resources/workspace when packaged, ./workspace in development.
export const templateDir = () =>
  app.isPackaged ? path.join(process.resourcesPath, "workspace") : path.join(app.getAppPath(), "workspace");

// Resolves `rel` inside `root`; null if it escapes (path traversal from IPC or URLs).
export function inside(root: string, rel: string): string | null {
  const full = path.resolve(root, rel);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}
