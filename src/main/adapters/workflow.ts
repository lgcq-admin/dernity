// ComfyUI workflow templating. A workflow is an API-format graph ("Export (API)" in ComfyUI) where
// string inputs hold placeholders: "{{prompt}}", "{{seed}}", "{{width}}", "{{file:first_frame}}", or any
// param key. A string that is exactly one placeholder takes the value's type (numbers stay numbers).
import type { ParamValue, ParamValues } from "@shared/model";

export type Values = Record<string, ParamValue>;

export type DeriveOptions = { fps?: number; frameStep?: number; sizeStep?: number };

const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

// Adds values computed from params: random seed, width/height from aspect + shortEdge,
// frames from seconds (n * frameStep + 1, which LTX/Wan style models expect).
export function deriveValues(prompt: string, params: ParamValues, opts: DeriveOptions = {}): Values {
  const values: Values = { ...params, prompt };
  if (values.seed === null || values.seed === undefined || values.seed === "") {
    values.seed = Math.floor(Math.random() * 2 ** 32);
  }
  const aspect = typeof params.aspect === "string" ? params.aspect.split(":").map(Number) : null;
  const shortEdge = Number(params.shortEdge);
  if (aspect?.length === 2 && aspect.every((n) => n > 0) && shortEdge > 0 && values.width == null && values.height == null) {
    const [w, h] = aspect as [number, number];
    const step = opts.sizeStep ?? 16;
    const scale = shortEdge / Math.min(w, h);
    values.width = round(w * scale, step);
    values.height = round(h * scale, step);
  }
  const seconds = Number(params.seconds);
  if (seconds > 0 && values.frames == null) {
    const fps = Number(params.fps ?? opts.fps ?? 24);
    const step = opts.frameStep ?? 8;
    values.fps = fps;
    values.frames = Math.max(1, Math.round((seconds * fps) / step)) * step + 1;
  }
  return values;
}

const EXACT = /^\{\{([a-zA-Z0-9_:]+)\}\}$/;
const INLINE = /\{\{([a-zA-Z0-9_:]+)\}\}/g;

export function placeholders(graph: unknown): Set<string> {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") for (const m of v.matchAll(INLINE)) found.add(m[1]!);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(graph);
  return found;
}

export function fillWorkflow<T>(graph: T, values: Values): T {
  const missing = [...placeholders(graph)].filter((k) => values[k] === undefined || values[k] === null);
  if (missing.length) throw new Error(`Workflow needs values for: ${missing.map((k) => `{{${k}}}`).join(", ")}`);
  const fill = (v: unknown): unknown => {
    if (typeof v === "string") {
      const exact = v.match(EXACT);
      if (exact) return values[exact[1]!];
      return v.replace(INLINE, (_, k: string) => String(values[k]));
    }
    if (Array.isArray(v)) return v.map(fill);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  return fill(graph) as T;
}
