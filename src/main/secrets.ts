// Provider API keys and the Hugging Face token. Order: key saved in the app (encrypted with safeStorage),
// environment variable, then the CLI's own config, so a user who already set up `vastai` / `runpodctl` /
// `hf auth login` needs nothing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, safeStorage } from "electron";
import type { KeySource, SecretName } from "@shared/types";

const file = () => path.join(app.getPath("userData"), "secrets.bin");

const ENV: Record<SecretName, string> = { runpod: "RUNPOD_API_KEY", vast: "VAST_API_KEY", huggingface: "HF_TOKEN" };

function readSaved(): Partial<Record<SecretName, string>> {
  try {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file())));
  } catch {
    return {};
  }
}

export function setKey(name: SecretName, key: string | null): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS keychain is not available, can't store the key safely");
  const saved = readSaved();
  if (key) saved[name] = key.trim();
  else delete saved[name];
  fs.writeFileSync(file(), safeStorage.encryptString(JSON.stringify(saved)), { mode: 0o600 });
}

function fromCli(name: SecretName): string | undefined {
  const home = os.homedir();
  try {
    if (name === "huggingface") {
      return fs.readFileSync(path.join(home, ".cache", "huggingface", "token"), "utf8").trim() || undefined;
    }
    if (name === "vast") {
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

export function getKey(name: SecretName): { key?: string; source: KeySource } {
  const saved = readSaved()[name];
  if (saved) return { key: saved, source: "app" };
  const env = process.env[ENV[name]];
  if (env) return { key: env, source: "env" };
  const cli = fromCli(name);
  if (cli) return { key: cli, source: "cli" };
  return { source: "none" };
}

export const keyStatus = (): Record<SecretName, KeySource> => ({
  runpod: getKey("runpod").source,
  vast: getKey("vast").source,
  huggingface: getKey("huggingface").source,
});

// What agent terminals get on top of the user's environment. The agent uses the token to read gated model
// cards and to pass it to the machines it deploys; scoping the token is up to the user. Also set when the
// token only lives in `hf auth login`'s file, so `$HF_TOKEN` in deploy commands isn't empty.
export function terminalEnv(): Record<string, string> {
  const { key } = getKey("huggingface");
  return key ? { HF_TOKEN: key } : {};
}
