// Deployment history. Two sources, joined for the UI and for agents that redeploy:
//   workspace/deployments.jsonl       written by the agent at deploy time: what model, how it was started
//   workspace/.dernity/machines.json  written by the app from provider APIs: when machines ran, at what price
import { z } from "zod";
import type { Instance, Provider } from "./types";

export const DeploymentSchema = z.object({
  id: z.string().regex(/^[\w.-]+$/).optional(),
  at: z.string(), // ISO time the machine was created
  model: z.string().describe("Hugging Face repo, e.g. Qwen/Qwen3-8B-GGUF"),
  file: z.string().optional().describe("Quant or weight file, e.g. Q4_K_M"),
  runtime: z.string().optional().describe("llama.cpp, vLLM, SGLang, ComfyUI…"),
  image: z.string().optional(),
  args: z.string().optional().describe("Server arguments, without secrets"),
  provider: z.enum(["runpod", "vast"]),
  machine: z.string().describe("Instance label / pod name"),
  machineId: z.string().optional(),
  gpu: z.string().optional(),
  pricePerHour: z.number().optional(),
  region: z.string().optional(),
  configId: z.string().optional(),
  notes: z.string().optional(),
});
export type Deployment = z.infer<typeof DeploymentSchema> & { id: string };

export function parseDeployments(text: string): { deployments: Deployment[]; invalid: number } {
  const deployments: Deployment[] = [];
  let invalid = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = DeploymentSchema.parse(JSON.parse(line));
      deployments.push({ ...d, id: d.id ?? `${d.machine}-${d.at}`.replace(/[^\w.-]+/g, "-") });
    } catch {
      invalid++;
    }
  }
  return { deployments, invalid };
}

export type RunSegment = { from: number; to: number; pricePerHour: number };

export type MachineRecord = {
  provider: Provider;
  id: string;
  name: string;
  gpu: string;
  gpuCount: number;
  region?: string;
  image?: string;
  storagePerHour?: number;
  pricePerHour: number; // latest running price the provider quoted
  createdAt?: number;
  firstSeen: number;
  lastSeen: number;
  status: Instance["status"] | "deleted";
  deletedAt?: number;
  runs: RunSegment[];
};

export type MachineHistory = Record<string, MachineRecord>; // key: "<provider>:<id>"

// A running machine seen again within this gap continues the same run; a longer gap (app closed,
// machine stopped and started) starts a new one, so time we didn't observe isn't billed.
export const RUN_GAP_MS = 5 * 60_000;

export const machineKey = (provider: Provider, id: string) => `${provider}:${id}`;

// Folds one provider poll into the history. `polled` lists providers whose API answered, so a machine
// missing from a provider that failed to answer isn't mistaken for deleted.
export function observe(history: MachineHistory, instances: Instance[], polled: Provider[], now: number): MachineHistory {
  const next: MachineHistory = structuredClone(history);
  const seen = new Set<string>();

  for (const inst of instances) {
    const key = machineKey(inst.provider, inst.id);
    seen.add(key);
    const rec: MachineRecord = next[key] ?? {
      provider: inst.provider,
      id: inst.id,
      name: inst.name,
      gpu: inst.gpu,
      gpuCount: inst.gpuCount,
      pricePerHour: inst.costPerHour,
      firstSeen: now,
      lastSeen: now,
      status: inst.status,
      runs: [],
    };
    Object.assign(rec, {
      name: inst.name,
      gpu: inst.gpu,
      gpuCount: inst.gpuCount,
      status: inst.status,
      pricePerHour: inst.costPerHour,
      lastSeen: now,
      ...(inst.region ? { region: inst.region } : {}),
      ...(inst.image ? { image: inst.image } : {}),
      ...(inst.storagePerHour !== undefined ? { storagePerHour: inst.storagePerHour } : {}),
      ...(inst.createdAt ? { createdAt: inst.createdAt } : {}),
    });
    if (inst.status === "running") {
      const last = rec.runs.at(-1);
      if (last && now - last.to <= RUN_GAP_MS && last.pricePerHour === inst.costPerHour) last.to = now;
      else rec.runs.push({ from: last && now - last.to <= RUN_GAP_MS ? last.to : now, to: now, pricePerHour: inst.costPerHour });
    }
    next[key] = rec;
  }

  for (const [key, rec] of Object.entries(next)) {
    if (!seen.has(key) && polled.includes(rec.provider) && rec.status !== "deleted") {
      rec.status = "deleted";
      rec.deletedAt = now;
    }
  }
  return next;
}

export const runHours = (r: MachineRecord) => r.runs.reduce((h, s) => h + (s.to - s.from) / 3_600_000, 0);
export const runCost = (r: MachineRecord) => r.runs.reduce((c, s) => c + ((s.to - s.from) / 3_600_000) * s.pricePerHour, 0);

export type HistoryEntry = { machine?: MachineRecord; deployment?: Deployment; startedAt: number };

// Pairs each machine with the deployment record the agent wrote for it: by machine id when given,
// otherwise by provider + name, taking the latest deployment created before the machine was last seen.
export function joinHistory(machines: MachineRecord[], deployments: Deployment[]): HistoryEntry[] {
  const used = new Set<string>();
  const entries: HistoryEntry[] = machines.map((m) => {
    const candidates = deployments
      .filter((d) => !used.has(d.id) && d.provider === m.provider && (d.machineId ? d.machineId === m.id : d.machine === m.name))
      .filter((d) => Date.parse(d.at) <= m.lastSeen + RUN_GAP_MS)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const deployment = candidates[0];
    if (deployment) used.add(deployment.id);
    return { machine: m, deployment, startedAt: m.createdAt ?? m.runs[0]?.from ?? m.firstSeen };
  });
  for (const d of deployments) if (!used.has(d.id)) entries.push({ deployment: d, startedAt: Date.parse(d.at) });
  return entries.sort((a, b) => b.startedAt - a.startedAt);
}
