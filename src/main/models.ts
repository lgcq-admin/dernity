// Model configs live in workspace/models/*.json, written by the user's agent. The app re-reads them on
// change, reports validation results back to the agent in .dernity/models-status.json, and never edits them.
import fs from "node:fs";
import path from "node:path";
import { type ModelConfig, type ModelEntry, type ModelHealth, parseModelFile } from "@shared/model";
import { MODELS, STATUS } from "./paths";

let entries: ModelEntry[] = [];
const health = new Map<string, ModelHealth>();
const listeners = new Set<(entries: ModelEntry[]) => void>();

export function loadModels(): ModelEntry[] {
  const files = fs.existsSync(MODELS) ? fs.readdirSync(MODELS).filter((f) => f.endsWith(".json")).sort() : [];
  const loaded = files.map((file) => parseModelFile(file, fs.readFileSync(path.join(MODELS, file), "utf8")));
  const seen = new Set<string>();
  for (const entry of loaded) {
    if (!entry.config) continue;
    if (seen.has(entry.config.id)) {
      entry.error = `Duplicate id "${entry.config.id}"`;
      delete entry.config;
    } else seen.add(entry.config.id);
  }
  entries = loaded;
  writeStatus();
  return entries;
}

export const listModels = () => entries;

export function getModel(id: string): ModelConfig {
  const config = entries.find((e) => e.config?.id === id)?.config;
  if (!config) throw new Error(`Model "${id}" not found or invalid`);
  return config;
}

export const getHealth = (id: string) => health.get(id);
export const allHealth = () => Object.fromEntries(health);

export function setHealth(id: string, h: ModelHealth): void {
  health.set(id, h);
  writeStatus();
}

export function onModelsChanged(cb: (entries: ModelEntry[]) => void): void {
  listeners.add(cb);
}

export function watchModels(): void {
  let timer: NodeJS.Timeout | undefined;
  fs.watch(MODELS, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      loadModels();
      for (const cb of listeners) cb(entries);
    }, 150);
  });
}

function writeStatus(): void {
  const status = Object.fromEntries(
    entries.map((e) => [
      e.file,
      e.config ? { id: e.config.id, valid: true, health: health.get(e.config.id) } : { valid: false, error: e.error },
    ]),
  );
  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(path.join(STATUS, "models-status.json"), JSON.stringify(status, null, 2) + "\n");
}
