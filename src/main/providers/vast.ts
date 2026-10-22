// Vast.ai REST API: credit and instances (with the ports and SSH addresses needed to reach them).
import type { Instance } from "@shared/types";

const API = "https://console.vast.ai/api";

export type VastInstance = {
  id: number;
  label?: string | null;
  actual_status?: string | null;
  intended_status?: string | null;
  gpu_name?: string;
  num_gpus?: number;
  dph_total?: number;
  public_ipaddr?: string;
  ssh_host?: string;
  ssh_port?: number;
  ports?: Record<string, { HostIp: string; HostPort: string }[]> | null;
  geolocation?: string | null;
  image_uuid?: string | null;
  storage_total_cost?: number | null;
  start_date?: number | null;
};

async function get<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Vast.ai API: invalid API key");
  if (!res.ok) throw new Error(`Vast.ai API: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchVastInstances(key: string): Promise<VastInstance[]> {
  const body = await get<{ instances?: VastInstance[]; msg?: string }>(key, "/v1/instances/");
  if (!body.instances) throw new Error(`Vast.ai API: ${body.msg ?? "unexpected response"}`);
  return body.instances;
}

export async function fetchVast(key: string): Promise<{ balance: number; instances: Instance[] }> {
  const [user, instances] = await Promise.all([
    get<{ credit: number }>(key, "/v0/users/current/"),
    fetchVastInstances(key),
  ]);
  return { balance: user.credit, instances: instances.map(toInstance) };
}

export function toInstance(v: VastInstance): Instance {
  const s = v.actual_status ?? "";
  const status: Instance["status"] =
    s === "running" ? "running" : s === "loading" || s === "created" ? "starting" : s === "exited" || s === "stopped" ? "stopped" : "unknown";
  return {
    provider: "vast",
    id: String(v.id),
    name: v.label || `vast-${v.id}`,
    status,
    gpu: v.gpu_name ?? "GPU",
    gpuCount: v.num_gpus ?? 1,
    costPerHour: v.dph_total ?? 0,
    ...(v.geolocation ? { region: v.geolocation } : {}),
    ...(v.image_uuid ? { image: v.image_uuid } : {}),
    ...(v.storage_total_cost != null ? { storagePerHour: v.storage_total_cost } : {}),
    ...(v.start_date ? { createdAt: Math.round(v.start_date * 1000) } : {}),
  };
}

// Public address of an instance port, if Vast maps it.
export function vastPublicPort(v: VastInstance, port: number): string | undefined {
  const hostPort = v.ports?.[`${port}/tcp`]?.[0]?.HostPort;
  return hostPort && v.public_ipaddr ? `http://${v.public_ipaddr}:${hostPort}` : undefined;
}

// Prefer direct SSH (mapped port 22) over Vast's SSH proxy.
export function vastSsh(v: VastInstance): { host: string; port: number } {
  const direct = v.ports?.["22/tcp"]?.[0]?.HostPort;
  if (direct && v.public_ipaddr) return { host: v.public_ipaddr, port: Number(direct) };
  if (!v.ssh_host || !v.ssh_port) throw new Error(`Vast instance ${v.id} has no SSH address yet`);
  return { host: v.ssh_host, port: v.ssh_port };
}
