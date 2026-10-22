// Provider API keys. Order: key saved in the app (encrypted with safeStorage), environment variable,
// then the provider CLI's own config, so a user who already set up `vastai` / `runpodctl` needs nothing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, safeStorage } from "electron";
import type { KeySource, Provider } from "@shared/types";

const file = () => path.join(app.getPath("userData"), "secrets.bin");

const ENV: Record<Provider, string> = { runpod: "RUNPOD_API_KEY", vast: "VAST_API_KEY" };

function readSaved(): Partial<Record<Provider, string>> {
  try {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file())));
  } catch {
    return {};
  }
}

export function setKey(provider: Provider, key: string | null): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS keychain is not available, can't store the key safely");
  const saved = readSaved();
  if (key) saved[provider] = key.trim();
  else delete saved[provider];
  fs.writeFileSync(file(), safeStorage.encryptString(JSON.stringify(saved)), { mode: 0o600 });
}

function fromCli(provider: Provider): string | undefined {
  const home = os.homedir();
  try {
    if (provider === "vast") {
      for (const f of [path.join(home, ".config", "vastai", "vast_api_key"), path.join(home, ".vast_api_key")]) {
        if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim() || undefined;
      }
    } else {
      const toml = fs.readFileSync(path.join(home, ".runpod", "config.toml"), "utf8");
      return toml.match(/^\s*apikey\s*=\s*["']([^"']+)["']/im)?.[1];
    }
  } catch {
    // no CLI config
  }
  return undefined;
}

export function getKey(provider: Provider): { key?: string; source: KeySource } {
  const saved = readSaved()[provider];
  if (saved) return { key: saved, source: "app" };
  const env = process.env[ENV[provider]];
  if (env) return { key: env, source: "env" };
  const cli = fromCli(provider);
  if (cli) return { key: cli, source: "cli" };
  return { source: "none" };
}

export const keyStatus = (): Record<Provider, KeySource> => ({
  runpod: getKey("runpod").source,
  vast: getKey("vast").source,
});
