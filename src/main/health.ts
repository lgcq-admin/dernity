// Keeps model health current: machines start, stop and finish loading without the config changing.
// Unhealthy models are re-checked often so a server that just came up turns green quickly.
import type { ModelHealth } from "@shared/model";
import { adapterFor } from "./adapters";
import { connect } from "./hosts";
import { getHealth, getModel, listModels, onModelsChanged, setHealth } from "./models";

const TICK_MS = 5_000;
const RECHECK_UNHEALTHY_MS = 15_000;
const RECHECK_HEALTHY_MS = 60_000;

const listeners = new Set<(id: string, h: ModelHealth) => void>();
export const onHealth = (cb: (id: string, h: ModelHealth) => void) => listeners.add(cb);

const inFlight = new Map<string, Promise<ModelHealth>>();

export function checkHealth(id: string): Promise<ModelHealth> {
  const running = inFlight.get(id);
  if (running) return running;
  const p = (async (): Promise<ModelHealth> => {
    try {
      const model = getModel(id);
      const detail = await adapterFor(model).health(await connect(model), model);
      return { ok: true, detail, checkedAt: Date.now() };
    } catch (err) {
      return { ok: false, detail: (err as Error).message, checkedAt: Date.now() };
    }
  })().then((h) => {
    inFlight.delete(id);
    setHealth(id, h);
    for (const cb of listeners) cb(id, h);
    return h;
  });
  inFlight.set(id, p);
  return p;
}

export function isDue(h: ModelHealth | undefined, now: number): boolean {
  if (!h) return true;
  return now - h.checkedAt >= (h.ok ? RECHECK_HEALTHY_MS : RECHECK_UNHEALTHY_MS);
}

export function startHealthMonitor(): void {
  const tick = () => {
    const now = Date.now();
    for (const e of listModels()) {
      if (e.config && isDue(getHealth(e.config.id), now)) void checkHealth(e.config.id);
    }
  };
  // A changed config may point somewhere else: check it right away.
  onModelsChanged((entries) => {
    for (const e of entries) if (e.config) void checkHealth(e.config.id);
  });
  tick();
  setInterval(tick, TICK_MS);
}
