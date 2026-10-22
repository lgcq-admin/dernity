// RunPod GraphQL API: balance and pods.
import type { Instance } from "@shared/types";

const API = "https://api.runpod.io/graphql";

type Pod = {
  id: string;
  name: string;
  desiredStatus: string;
  costPerHr: number;
  gpuCount: number;
  imageName?: string | null;
  machine?: { gpuDisplayName?: string } | null;
  runtime?: { uptimeInSeconds?: number } | null;
};

export async function fetchRunpod(key: string): Promise<{ balance: number; instances: Instance[] }> {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "{ myself { clientBalance pods { id name desiredStatus costPerHr gpuCount imageName machine { gpuDisplayName } runtime { uptimeInSeconds } } } }",
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`RunPod API: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { myself?: { clientBalance: number; pods: Pod[] } | null }; errors?: { message: string }[] };
  const me = body.data?.myself;
  if (!me) throw new Error(`RunPod API: ${body.errors?.[0]?.message ?? "invalid API key"}`);
  return { balance: me.clientBalance, instances: me.pods.map(toInstance) };
}

export function toInstance(p: Pod): Instance {
  const running = p.desiredStatus === "RUNNING";
  return {
    provider: "runpod",
    id: p.id,
    name: p.name,
    status: running ? (p.runtime ? "running" : "starting") : p.desiredStatus === "EXITED" ? "stopped" : "exited",
    gpu: (p.machine?.gpuDisplayName ?? "GPU").replace(/^NVIDIA /, ""),
    gpuCount: p.gpuCount,
    costPerHour: p.costPerHr,
    ...(p.imageName ? { image: p.imageName } : {}),
  };
}

export const runpodProxyUrl = (podId: string, port: number) => `https://${podId}-${port}.proxy.runpod.net`;

type PodPort = { ip: string; isIpPublic: boolean; privatePort: number; publicPort: number; type: string };

// Public SSH address of a running pod (its mapped port 22), for tunnels.
export async function fetchRunpodSsh(key: string, podId: string): Promise<{ host: string; port: number }> {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "query Pod($id: String!) { pod(input: { podId: $id }) { runtime { ports { ip isIpPublic privatePort publicPort type } } } }",
      variables: { id: podId },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`RunPod API: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { pod?: { runtime?: { ports?: PodPort[] } | null } | null } };
  const ssh = body.data?.pod?.runtime?.ports?.find((p) => p.privatePort === 22 && p.isIpPublic);
  if (!ssh) throw new Error(`RunPod pod ${podId} has no public SSH port (expose 22/tcp)`);
  return { host: ssh.ip, port: ssh.publicPort };
}
