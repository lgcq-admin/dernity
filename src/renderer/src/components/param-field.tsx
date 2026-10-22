// One form field rendered from a model config param.
import type { Param, ParamValue } from "@shared/model";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Props = { param: Param; value: ParamValue; onChange: (v: ParamValue) => void };

export function ParamField({ param, value, onChange }: Props) {
  const id = `param-${param.key}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {param.label}
      </Label>
      <Control id={id} param={param} value={value} onChange={onChange} />
      {param.hint && <p className="text-xs text-muted-foreground/80">{param.hint}</p>}
    </div>
  );
}

function Control({ id, param, value, onChange }: Props & { id: string }) {
  switch (param.type) {
    case "select":
      return (
        <Select value={value == null ? "" : String(value)} onValueChange={(v) => onChange(parseOption(param, v))}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={param.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {(param.options ?? []).map((o) => (
              <SelectItem key={String(o)} value={String(o)}>
                {o}
                {param.suffix ? ` ${param.suffix}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "number":
      return (
        <div className="relative">
          <Input
            id={id}
            type="number"
            min={param.min}
            max={param.max}
            step={param.step}
            placeholder={param.placeholder}
            value={value == null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
          {param.suffix && <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{param.suffix}</span>}
        </div>
      );
    case "boolean":
      return <Switch id={id} checked={value === true} onCheckedChange={onChange} />;
    case "textarea":
      return <Textarea id={id} rows={3} placeholder={param.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
    case "text":
      return <Input id={id} placeholder={param.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
}

// Select values come back as strings; keep numeric options numeric.
function parseOption(param: Param, v: string): ParamValue {
  const match = param.options?.find((o) => String(o) === v);
  return match ?? v;
}
