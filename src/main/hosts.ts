// Turns a model's host into something to send HTTP requests to: a public URL, RunPod's HTTPS proxy,
// a mapped Vast port, or an `ssh -L` tunnel when the port isn't exposed.
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import os from "node:os";
import type { Host, ModelConfig } from "@shared/model";
import { refreshShellEnv } from "./env";
import { SECRETS } from "./paths";
import { readTokenFile } from "./safe-file";
import { pickByName } from "./providers/pick";
import { fetchRunpod, fetchRunpodSsh, runpodProxyUrl } from "./providers/runpod";
import { fetchVastInstances, type VastInstance, vastPublicPort, vastSsh } from "./providers/vast";
import { getKey } from "./secrets";

// Provider lists are shared by every model's health check; cache them briefly and merge concurrent calls.
const lists = new Map<string, { at: number; value: Promise<unknown> }>();
function cachedList<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = lists.get(key);
  if (hit && Date.now() - hit.at < 10_000) return hit.value as Promise<T>;
  const value = fn();
  lists.set(key, { at: Date.now(), value });
  value.catch(() => lists.delete(key));
  return value;
}

export type Conn = {
  baseUrl: string;
  fetch(path: string, init?: RequestInit): Promise<Response>;
};

export async function connect(model: ModelConfig): Promise<Conn> {
  const { baseUrl, headers } = await resolveHost(model.host);
  const token = await serverToken(model);
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const base = baseUrl.replace(/\/+$/, "");
  return {
    baseUrl: base,
    fetch: (urlPath, init = {}) =>
      fetch(base + urlPath, { ...init, headers: { ...headers, ...auth, ...(init.headers as Record<string, string>) } }),
  };
}

async function serverToken(model: ModelConfig): Promise<string | undefined> {
  if (model.apiKeyFile) return readTokenFile(SECRETS, model.apiKeyFile);
  if (model.apiKeyEnv) {
    // The user may have just added the export to their shell profile; re-read it before giving up.
    if (!process.env[model.apiKeyEnv]) await refreshShellEnv();
    const token = process.env[model.apiKeyEnv];
    if (!token) throw new Error(`Environment variable ${model.apiKeyEnv} is not set in your shell profile`);
    return token;
  }
  return undefined;
}

async function resolveHost(host: Host): Promise<{ baseUrl: string; headers: Record<string, string> }> {
  switch (host.type) {
    case "url":
      return { baseUrl: host.url, headers: {} };
    case "runpod": {
      const id = host.pod ?? (await runpodPodByName(host.podName));
      if (host.tunnel) {
        const ssh = await fetchRunpodSsh(getKey("runpod").key ?? "", id);
        return { baseUrl: await tunnel({ ...ssh, user: "root", key: host.sshKey }, host.port), headers: {} };
      }
      // RunPod's proxy rejects some default user agents with 403.
      return { baseUrl: runpodProxyUrl(id, host.port), headers: { "User-Agent": "curl/8.5.0" } };
    }
    case "vast": {
      const inst = await vastInstance(host.instance, host.label);
      if (inst.actual_status !== "running") throw new Error(`Vast instance ${inst.label ?? inst.id} is ${inst.actual_status ?? "not running"}`);
      const pub = vastPublicPort(inst, host.port);
      if (pub && !host.tunnel) return { baseUrl: pub, headers: {} };
      const ssh = vastSsh(inst);
      return { baseUrl: await tunnel({ ...ssh, user: "root", key: host.sshKey }, host.port), headers: {} };
    }
    case "ssh":
      return { baseUrl: await tunnel({ host: host.ip, port: host.sshPort, user: host.user, key: host.sshKey }, host.port), headers: {} };
  }
}

async function runpodPodByName(name?: string): Promise<string> {
  if (!name) throw new Error("runpod host needs pod or podName");
  const { key } = getKey("runpod");
  if (!key) throw new Error("RunPod API key is not set (Settings, RUNPOD_API_KEY or runpodctl config)");
  const { instances } = await cachedList(`runpod:${key}`, () => fetchRunpod(key));
  const pod = pickByName(instances, name, (p) => p.name, (p) => p.status === "running");
  if (!pod) throw new Error(`No RunPod pod named "${name}"`);
  return pod.id;
}

async function vastInstance(id?: number, label?: string): Promise<VastInstance> {
  if (!id && !label) throw new Error("vast host needs instance or label");
  const { key } = getKey("vast");
  if (!key) throw new Error("Vast.ai API key is not set (Settings, VAST_API_KEY or vastai config)");
  const all = await cachedList(`vast:${key}`, () => fetchVastInstances(key));
  const hit = id ? all.find((v) => v.id === id) : pickByName(all, label!, (v) => v.label, (v) => v.actual_status === "running");
  if (!hit) throw new Error(`No Vast instance ${id ?? `labelled "${label}"`}`);
  return hit;
}

// ---- SSH tunnels ----

type Ssh = { host: string; port: number; user: string; key?: string };
const tunnels = new Map<string, { proc: ChildProcess; ready: Promise<string> }>();

const expandHome = (p: string) => p.replace(/^~(?=\/|$)/, os.homedir());

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => resolve(false));
  });
}

async function tunnel(ssh: Ssh, remotePort: number): Promise<string> {
  const id = `${ssh.user}@${ssh.host}:${ssh.port}->${remotePort}`;
  const existing = tunnels.get(id);
  if (existing && existing.proc.exitCode === null) return existing.ready;

  const localPort = await freePort();
  // Hosts from provider APIs aren't schema-validated, so check here too.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(ssh.host) || !/^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(ssh.user)) {
    throw new Error(`Refusing suspicious SSH address ${ssh.user}@${ssh.host}`);
  }
  const args = [
    ...(ssh.key ? ["-i", expandHome(ssh.key)] : []),
    "-l", ssh.user,
    "-p", String(ssh.port), "-N",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=15",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=15",
    "-L", `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
    "--",
    ssh.host,
  ];
  const proc = spawn("ssh", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr!.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
  proc.on("exit", () => tunnels.get(id)?.proc === proc && tunnels.delete(id));

  const ready = (async () => {
    for (let i = 0; i < 80; i++) {
      if (proc.exitCode !== null) throw new Error(`SSH tunnel failed: ${stderr.trim().slice(-300) || `exit ${proc.exitCode}`}`);
      if (await canConnect(localPort)) return `http://127.0.0.1:${localPort}`;
      await new Promise((r) => setTimeout(r, 250));
    }
    proc.kill();
    throw new Error("SSH tunnel timed out");
  })();
  ready.catch(() => tunnels.delete(id));
  tunnels.set(id, { proc, ready });
  return ready;
}

export function closeTunnels(): void {
  for (const t of tunnels.values()) t.proc.kill();
  tunnels.clear();
}
