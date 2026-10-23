// One form field rendered from a model config param. Which control and how wide comes from
// fieldLayout(); this file only draws it.
import { useEffect, useState } from "react";
import type { Param, ParamValue } from "@shared/model";
import { fieldLayout, normalizeNumber, paramOptions, readNumber, stepNumber } from "@shared/params";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = { param: Param; value: ParamValue; onChange: (v: ParamValue) => void };

export function ParamField({ param, value, onChange }: Props) {
  const id = `param-${param.key}`;
  const { control } = fieldLayout(param);

  if (control === "boolean") {
    return (
      <div className="grid gap-1.5">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <FieldLabel id={id} param={param} />
          <Switch id={id} checked={value === true} onCheckedChange={onChange} />
        </div>
        <Hint param={param} />
      </div>
    );
  }

  if (control === "slider") {
    const n = typeof value === "number" ? value : null;
    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel id={id} param={param} />
          <NumberInput id={id} param={param} value={value} onChange={onChange} className="h-7 w-20 text-right" />
        </div>
        <Slider
          min={param.min}
          max={param.max}
          step={param.step ?? rangeStep(param)}
          value={[n ?? param.min ?? 0]}
          onValueChange={([v]) => v !== undefined && onChange(v)}
          className={cn(n === null && "opacity-50")}
          aria-label={param.label}
        />
        <Hint param={param} />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <FieldLabel id={id} param={param} />
      {control === "select" && <SelectControl id={id} param={param} value={value} onChange={onChange} />}
      {control === "segmented" && <Segmented param={param} value={value} onChange={onChange} />}
      {control === "number" && <NumberInput id={id} param={param} value={value} onChange={onChange} />}
      {control === "text" && <Input id={id} placeholder={param.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />}
      {control === "textarea" && (
        <Textarea id={id} rows={3} placeholder={param.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      )}
      <Hint param={param} />
    </div>
  );
}

function FieldLabel({ id, param }: { id: string; param: Param }) {
  return (
    <Label htmlFor={id} className="min-w-0 truncate text-xs font-normal text-muted-foreground" title={param.label}>
      {param.label}
      {param.required && <Required />}
    </Label>
  );
}

export function Required() {
  return (
    <span className="-ml-1.5 text-red-400" aria-label="required">
      *
    </span>
  );
}

function Hint({ param }: { param: Param }) {
  return param.hint ? <p className="text-xs text-pretty text-muted-foreground/80">{param.hint}</p> : null;
}

function SelectControl({ id, param, value, onChange }: Props & { id: string }) {
  const options = paramOptions(param);
  const selected = options.find((o) => String(o.value) === String(value));
  return (
    <Select value={value == null ? "" : String(value)} onValueChange={(v) => onChange(options.find((o) => String(o.value) === v)?.value ?? v)}>
      <SelectTrigger id={id} className="w-full min-w-0" title={selected?.label}>
        <SelectValue placeholder={param.placeholder ?? "Choose"} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72 max-w-[min(28rem,calc(100vw-2rem))]">
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)} className="break-words">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Segmented({ param, value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label={param.label} className="flex h-9 min-w-0 rounded-md border bg-input/30 p-0.5">
      {paramOptions(param).map((o) => {
        const on = String(o.value) === String(value);
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-0 flex-1 truncate rounded-sm px-1.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              on && "bg-secondary text-foreground shadow-xs ring-1 ring-white/10",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A text field that holds a number. Not <input type="number">: no spinner arrows, no silently
// swallowed commas, and the user can type freely; the value is clamped and snapped on blur.
function NumberInput({ id, param, value, onChange, className }: Props & { id: string; className?: string }) {
  const [draft, setDraft] = useState(format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(format(value));
  }, [value, focused]);

  const parsed = readNumber(draft);
  const invalid = parsed === undefined || (parsed !== null && !inRange(parsed, param));

  const commit = () => {
    setFocused(false);
    const n = readNumber(draft);
    const next = n === undefined ? value : n === null ? null : normalizeNumber(n, param);
    setDraft(format(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="relative min-w-0">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={param.placeholder ?? (param.default === null ? "auto" : undefined)}
        value={draft}
        aria-invalid={invalid || undefined}
        title={rangeText(param)}
        className={cn("tabular-nums", param.suffix && "pr-8", className)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = readNumber(e.target.value);
          if (n === null || (n !== undefined && inRange(n, param))) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const next = stepNumber(readNumber(draft) ?? value, param, e.key === "ArrowUp" ? 1 : -1, e.shiftKey ? 10 : 1);
          setDraft(format(next));
          onChange(next);
        }}
      />
      {param.suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{param.suffix}</span>
      )}
    </div>
  );
}

function format(v: ParamValue): string {
  return v === null || v === undefined ? "" : String(v);
}

function inRange(n: number, p: Param): boolean {
  return (p.min === undefined || n >= p.min) && (p.max === undefined || n <= p.max);
}

function rangeText(p: Param): string | undefined {
  if (p.min !== undefined && p.max !== undefined) return `${p.min}–${p.max}`;
  if (p.min !== undefined) return `≥ ${p.min}`;
  if (p.max !== undefined) return `≤ ${p.max}`;
  return undefined;
}

// Without a declared step, a 0–2 range (temperature) needs finer steps than a 1–50 one (steps).
function rangeStep(p: Param): number {
  const span = (p.max ?? 1) - (p.min ?? 0);
  return span <= 2 ? 0.01 : span <= 20 ? 0.1 : 1;
}
