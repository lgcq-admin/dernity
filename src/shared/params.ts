// How a declared param becomes a form control: which control, how wide, and how typed numbers are read.
// Pure, so the renderer stays a thin mapping and this stays testable.
import type { ModelConfig, Param, ParamValue, ParamValues } from "./model";

export type Option = { value: string | number; label: string };

export type Control = "select" | "segmented" | "slider" | "number" | "text" | "textarea" | "boolean";

// Two columns in the studio form; a wide field takes the whole row.
export type FieldLayout = { control: Control; wide: boolean };

export function paramOptions(p: Param): Option[] {
  return (p.options ?? []).map((o) =>
    typeof o === "object" ? o : { value: o, label: p.suffix ? `${o} ${p.suffix}` : String(o) },
  );
}

export function fieldLayout(p: Param): FieldLayout {
  switch (p.type) {
    case "text":
    case "textarea":
      return { control: p.type, wide: true };
    case "boolean":
      return { control: "boolean", wide: false };
    case "number":
      return hasRange(p) ? { control: "slider", wide: true } : { control: "number", wide: false };
    case "select": {
      const labels = paramOptions(p).map((o) => o.label.length);
      const total = labels.reduce((a, b) => a + b, 0);
      // A few short choices read better as buttons: one click, all visible.
      if (labels.length > 0 && labels.length <= 3 && total <= 14) return { control: "segmented", wide: false };
      if (labels.length > 0 && labels.length <= 5 && total <= 30 && Math.max(...labels) <= 8) return { control: "segmented", wide: true };
      return { control: "select", wide: Math.max(0, ...labels) > 14 };
    }
  }
}

function hasRange(p: Param): p is Param & { min: number; max: number } {
  return p.min !== undefined && p.max !== undefined && p.max > p.min;
}

// Reads what the user typed. Commas count as decimal points; empty means auto (null).
// Returns undefined when the text isn't a number.
export function readNumber(text: string): number | null | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return undefined;
  return Number(t);
}

// Clamps to min/max and snaps to step, counted from min so a range of 4..30 step 2 stays even-from-4.
export function normalizeNumber(n: number, p: Param): number {
  let v = n;
  if (p.step) {
    const base = p.min ?? 0;
    v = base + Math.round((v - base) / p.step) * p.step;
    v = Number(v.toFixed(decimals(p.step)));
  }
  if (p.min !== undefined) v = Math.max(p.min, v);
  if (p.max !== undefined) v = Math.min(p.max, v);
  return v;
}

export function stepNumber(value: ParamValue, p: Param, direction: 1 | -1, times = 1): number {
  const step = p.step ?? 1;
  const current = typeof value === "number" ? value : (p.min ?? 0);
  return normalizeNumber(current + direction * step * times, p);
}

function decimals(step: number): number {
  const s = String(step);
  return s.includes(".") ? s.length - s.indexOf(".") - 1 : 0;
}

// Labels of what's still missing before a generation can run, in form order. Used to disable Generate
// in the renderer and to reject the request in main.
export function missingRequired(
  model: Pick<ModelConfig, "prompt" | "inputs" | "params">,
  form: { prompt: string; params: ParamValues; fileCounts: Record<string, number> },
): string[] {
  const missing: string[] = [];
  if (model.prompt === "required" && !form.prompt.trim()) missing.push("Prompt");
  for (const i of model.inputs) if (i.required && !form.fileCounts[i.key]) missing.push(i.label);
  for (const p of model.params) {
    const v = form.params[p.key];
    if (p.required && (v === null || v === undefined || v === "")) missing.push(p.label);
  }
  return missing;
}
