// Image/video generation for one model: a form built from the model's declared inputs and params,
// next to everything generated with it.
import { SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { defaultParamValues, type ModelConfig, type ParamValues } from "@shared/model";
import { fileUrl, type Generation } from "@shared/types";
import { FileSlot } from "@/components/file-slot";
import { GenerationCard } from "@/components/generation-card";
import { StatusDot, statusText } from "@/components/model-status";
import { ParamField } from "@/components/param-field";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { Health } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { fileToIncoming } from "@/lib/files";

type Props = {
  model: ModelConfig;
  health: Health;
  onCheck: () => void;
  generations: Generation[];
  reuse: Generation | null;
  onOpen: (g: Generation) => void;
};

export function StudioView({ model, health, onCheck, generations, reuse, onOpen }: Props) {
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

  const missing = model.inputs.filter((i) => i.required && !files[i.key]?.length);

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
        <div className="grid gap-4 p-4">
          <div className="flex items-center gap-2">
            <StatusDot health={health} onCheck={onCheck} />
            <span className="text-sm font-medium">{model.name}</span>
          </div>
          <p className="-mt-3 truncate text-xs text-muted-foreground" title={statusText(health)}>
            {statusText(health)}
          </p>

          <div className="grid gap-1.5">
            <Textarea
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

          {model.inputs.map((input) => (
            <FileSlot key={input.key} input={input} files={files[input.key] ?? []} onChange={(f) => setFiles({ ...files, [input.key]: f })} />
          ))}

          {model.params.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {model.params.map((p) => (
                <div key={p.key} className={p.type === "textarea" || p.type === "text" ? "col-span-2" : undefined}>
                  <ParamField param={p} value={params[p.key] ?? null} onChange={(v) => setParams({ ...params, [p.key]: v })} />
                </div>
              ))}
            </div>
          )}

          <Button onClick={() => void generate()} disabled={busy || missing.length > 0}>
            <SparklesIcon /> {missing.length ? `Add ${missing[0]!.label.toLowerCase()}` : "Generate"}
            <span className="ml-auto text-xs opacity-60">Ctrl+Enter</span>
          </Button>
        </div>
      </ScrollArea>

      <ScrollArea className="min-w-0 flex-1">
        {mine.length === 0 ? (
          <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
            Results from {model.name} will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 p-4">
            {mine.map((g) => (
              <GenerationCard key={g.id} g={g} onOpen={() => onOpen(g)} />
            ))}
          </div>
        )}
      </ScrollArea>
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
