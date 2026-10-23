// Image/video generation for one model: a form built from the model's declared inputs and params,
// next to everything generated with it.
import { BookOpenTextIcon, ChevronRightIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { BestiaryEntry } from "@shared/bestiary";
import { defaultParamValues, type ModelConfig, type ParamValues } from "@shared/model";
import { fieldLayout, missingRequired } from "@shared/params";
import { fileUrl, type Generation } from "@shared/types";
import { FileSlot } from "@/components/file-slot";
import { GenerationCard } from "@/components/generation-card";
import { StatusDot, statusText } from "@/components/model-status";
import { ParamField, Required } from "@/components/param-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { Health } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { fileToIncoming } from "@/lib/files";
import type { Preset } from "@/views/bestiary-view";
import { cn } from "@/lib/utils";

type Props = {
  model: ModelConfig;
  health: Health;
  onCheck: () => void;
  generations: Generation[];
  reuse: Generation | null;
  preset: (Preset & { n: number }) | null;
  guide?: BestiaryEntry;
  onOpenGuide: (id: string) => void;
  onOpen: (g: Generation, list: Generation[]) => void;
};

export function StudioView({ model, health, onCheck, generations, reuse, preset, guide, onOpenGuide, onOpen }: Props) {
  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState<ParamValues>(() => defaultParamValues(model.params));
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setParams(defaultParamValues(model.params));
    setFiles({});
  }, [model.id, model.params]);

  useEffect(() => {
    if (!reuse || reuse.modelId !== model.id) return;
    setPrompt(reuse.prompt);
    setParams({ ...defaultParamValues(model.params), ...reuse.params });
    void loadRefs(reuse).then(setFiles);
  }, [reuse, model.id, model.params]);

  // A preset from the bestiary fills only what it names, and only params this model has. Applied once
  // per preset (keyed by n), so later edits to the form stick.
  const apply = (p: Pick<Preset, "prompt" | "params">) => {
    if (p.prompt !== undefined) setPrompt(p.prompt);
    const known = Object.entries(p.params ?? {}).filter(([k]) => model.params.some((x) => x.key === k));
    if (known.length) setParams((cur) => ({ ...cur, ...Object.fromEntries(known) }));
  };

  useEffect(() => {
    if (preset && preset.modelId === model.id) apply(preset);
  }, [preset?.n]);

  const fileCounts = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, f.length]));
  const missing = missingRequired(model, { prompt, params, fileCounts });

  const generate = async () => {
    if (busy || missing.length) return;
    setBusy(true);
    try {
      const payload: Record<string, Awaited<ReturnType<typeof fileToIncoming>>[]> = {};
      for (const [key, list] of Object.entries(files)) payload[key] = await Promise.all(list.map(fileToIncoming));
      await api.generations.submit({ modelId: model.id, prompt, params, files: payload });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mine = generations.filter((g) => g.modelId === model.id);

  return (
    <div className="flex h-full">
      <ScrollArea className="w-96 shrink-0 border-r">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4">
          <div className="flex items-center gap-2">
            <StatusDot health={health} onCheck={onCheck} />
            <span className="truncate font-display text-2xl leading-none font-light">{model.name}</span>
          </div>
          <p className="-mt-2 truncate text-xs text-muted-foreground" title={statusText(health)}>
            {statusText(health)}
          </p>

          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <Label htmlFor="prompt" className="text-xs font-normal text-muted-foreground">
                Prompt
                {model.prompt === "required" && <Required />}
              </Label>
              {model.prompt === "optional" && <span>optional</span>}
            </div>
            <Textarea
              id="prompt"
              rows={6}
              placeholder="Describe what to generate"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void generate();
              }}
            />
            {model.notes && <p className="text-xs whitespace-pre-wrap text-muted-foreground">{model.notes}</p>}
          </div>

          {guide && <GuideCard guide={guide} model={model} onApply={apply} onOpen={() => onOpenGuide(guide.id)} />}

          {model.inputs.map((input) => (
            <FileSlot key={input.key} input={input} files={files[input.key] ?? []} onChange={(f) => setFiles({ ...files, [input.key]: f })} />
          ))}

          {model.params.length > 0 && (
            <div className="grid grid-flow-row-dense grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-4">
              {model.params.map((p) => (
                <div key={p.key} className={cn("min-w-0", fieldLayout(p).wide && "col-span-2")}>
                  <ParamField param={p} value={params[p.key] ?? null} onChange={(v) => setParams({ ...params, [p.key]: v })} />
                </div>
              ))}
            </div>
          )}

          <Button onClick={() => void generate()} disabled={busy || missing.length > 0}>
            <SparklesIcon /> {missing.length ? `Add ${missing[0]!.toLowerCase()}` : "Generate"}
            <span className="ml-auto text-xs opacity-60">Ctrl+Enter</span>
          </Button>
        </div>
      </ScrollArea>

      <ScrollArea className="min-w-0 flex-1">
        {mine.length === 0 ? (
          <div className="flex h-[70vh] flex-col items-center justify-center gap-2 text-center">
            <span className="font-display text-4xl leading-none font-light text-muted-foreground/70">Nothing yet</span>
            <span className="text-sm text-muted-foreground">
              Results from {model.name} land here. <kbd className="font-sans text-xs">Ctrl+Enter</kbd> to generate.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-4">
            {mine.map((g) => (
              <GenerationCard key={g.id} g={g} onOpen={() => onOpen(g, mine)} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// The bestiary guide in short, next to the form: one click fills an example or the recommended settings.
function GuideCard({ guide, model, onApply, onOpen }: { guide: BestiaryEntry; model: ModelConfig; onApply: (p: Pick<Preset, "prompt" | "params">) => void; onOpen: () => void }) {
  const recommended = Object.fromEntries(
    guide.settings.filter((s) => s.key && model.params.some((p) => p.key === s.key)).map((s) => [s.key!, s.value]),
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 rounded-lg border bg-card p-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <BookOpenTextIcon className="size-3.5 text-primary" /> Guide
        {guide.prompting.tips[0] && <span className="min-w-0 truncate">· {guide.prompting.tips[0]}</span>}
        <ChevronRightIcon className="ml-auto size-3.5 shrink-0" />
      </button>
      {(guide.prompting.examples.length > 0 || Object.keys(recommended).length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(recommended).length > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onApply({ params: recommended })}>
              Recommended settings
            </Button>
          )}
          {guide.prompting.examples.map((ex) => (
            <Button key={ex.title} variant="secondary" size="sm" className="h-7 max-w-full text-xs" title={ex.prompt} onClick={() => onApply(ex)}>
              <span className="min-w-0 truncate">{ex.title}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

async function loadRefs(g: Generation): Promise<Record<string, File[]>> {
  const out: Record<string, File[]> = {};
  for (const [key, names] of Object.entries(g.inputs)) {
    out[key] = await Promise.all(
      names.map(async (name) => {
        const blob = await (await fetch(fileUrl("library", `${g.dir}/refs/${name}`))).blob();
        return new File([blob], name.replace(/^[^-]+-\d+-/, ""), { type: blob.type });
      }),
    );
  }
  return out;
}
