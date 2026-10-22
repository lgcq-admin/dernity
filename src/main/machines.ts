// Polls the providers in the background and keeps workspace/.dernity/machines.json: every machine the
// user had, when it ran and at what price. Combined with the agent's deployments.jsonl it's the history.
import fs from "node:fs";
import path from "node:path";
import { type MachineHistory, observe, parseDeployments } from "@shared/history";
import type { ProviderState } from "@shared/types";
import { STATUS, WORKSPACE } from "./paths";
import { listMachines } from "./providers";

const POLL_MS = 60_000;
const historyFile = () => path.join(STATUS, "machines.json");
const deploymentsFile = () => path.join(WORKSPACE, "deployments.jsonl");

let history: MachineHistory | undefined;

function load(): MachineHistory {
  try {
    return JSON.parse(fs.readFileSync(historyFile(), "utf8")) as MachineHistory;
  } catch {
    return {};
  }
}

export async function pollMachines(): Promise<ProviderState[]> {
  const states = await listMachines();
  const polled = states.filter((s) => s.keySource !== "none" && !s.error).map((s) => s.provider);
  history = observe(history ?? load(), states.flatMap((s) => s.instances), polled, Date.now());
  fs.writeFileSync(historyFile(), JSON.stringify(history, null, 2) + "\n");
  return states;
}

export function readHistory() {
  const text = fs.existsSync(deploymentsFile()) ? fs.readFileSync(deploymentsFile(), "utf8") : "";
  const { deployments, invalid } = parseDeployments(text);
  return { machines: Object.values(history ?? load()), deployments, invalidDeployments: invalid };
}

export function startMachineTracker(): void {
  const tick = () => void pollMachines().catch(() => undefined);
  tick();
  setInterval(tick, POLL_MS);
}
