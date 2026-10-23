// Model guides in workspace/bestiary/*.json, written by the agent. Re-read on change; validation results
// go back to the agent in .dernity/bestiary-status.json, like models-status.json for configs.
import fs from "node:fs";
import path from "node:path";
import { type BestiaryFile, parseBestiaryFile } from "@shared/bestiary";
import { BESTIARY, STATUS } from "./paths";

let files: BestiaryFile[] = [];
const listeners = new Set<(files: BestiaryFile[]) => void>();

export function loadBestiary(): BestiaryFile[] {
  const names = fs.existsSync(BESTIARY) ? fs.readdirSync(BESTIARY).filter((f) => f.endsWith(".json")).sort() : [];
  files = names.map((file) => parseBestiaryFile(file, fs.readFileSync(path.join(BESTIARY, file), "utf8")));
  const status = Object.fromEntries(files.map((f) => [f.file, f.entry ? { id: f.entry.id, valid: true } : { valid: false, error: f.error }]));
  fs.writeFileSync(path.join(STATUS, "bestiary-status.json"), JSON.stringify(status, null, 2) + "\n");
  return files;
}

export const listBestiary = () => files;

export const onBestiaryChanged = (cb: (files: BestiaryFile[]) => void) => listeners.add(cb);

export function watchBestiary(): void {
  let timer: NodeJS.Timeout | undefined;
  fs.watch(BESTIARY, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      loadBestiary();
      for (const cb of listeners) cb(files);
    }, 150);
  });
}
