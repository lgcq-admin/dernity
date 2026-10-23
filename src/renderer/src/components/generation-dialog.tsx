// Full-window viewer for one generation: the media on a dark stage, everything about it in a side panel,
// arrows to walk through the list it was opened from.
import { AlertCircleIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, FolderOpenIcon, Loader2Icon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import type { ModelConfig, ParamValue } from "@shared/model";
import { paramOptions } from "@shared/params";
import { fileUrl, type Generation } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { isVideo } from "@/lib/files";
import { cn } from "@/lib/utils";

type Props = {
  g: Generation | null;
  list: Generation[];
  model?: ModelConfig;
  onNavigate: (g: Generation) => void;
  onClose: () => void;
  onReuse?: (g: Generation) => void;
  onDelete: (id: string) => Promise<void>;
};

export function GenerationDialog({ g, list, model, onNavigate, onClose, onReuse, onDelete }: Props) {
  const index = g ? list.findIndex((x) => x.id === g.id) : -1;
  const prev = index > 0 ? list[index - 1] : undefined;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;

  return (
    <Dialog open={!!g} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/80 backdrop-blur-sm"
        className="grid h-[min(92vh,960px)] w-[min(96vw,1480px)] max-w-none grid-cols-[minmax(0,1fr)_22rem] gap-0 overflow-hidden p-0 sm:max-w-none"
        onKeyDown={(e) => {
          if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
          if (e.key === "ArrowLeft" && prev) onNavigate(prev);
          if (e.key === "ArrowRight" && next) onNavigate(next);
        }}
      >
        {g && (
          <>
            <Stage key={g.id} g={g} />
            {prev && <NavButton side="left" onClick={() => onNavigate(prev)} />}
            {next && <NavButton side="right" onClick={() => onNavigate(next)} />}
            {list.length > 1 && index >= 0 && (
              <span className="absolute top-4 left-4 rounded-sm bg-black/60 px-2 py-0.5 text-xs text-white/80 tabular-nums">
                {index + 1} / {list.length}
              </span>
            )}
            <Details g={g} model={model} onClose={onClose} onReuse={onReuse} onDelete={onDelete} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stage({ g }: { g: Generation }) {
  const [shown, setShown] = useState(0);
  const [size, setSize] = useState<string>();
  const file = g.outputs[Math.min(shown, g.outputs.length - 1)];
  const src = file ? fileUrl("library", `${g.dir}/${file}`) : undefined;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-col bg-[#030303]">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {file && src ? (
          isVideo(file) ? (
            <video
              key={src}
              src={src}
              className="max-h-full max-w-full rounded-sm"
              controls
              autoPlay
              loop
              playsInline
              onLoadedMetadata={(e) => setSize(`${e.currentTarget.videoWidth} × ${e.currentTarget.videoHeight}`)}
            />
          ) : (
            <img
              key={src}
              src={src}
              alt={g.prompt}
              className="max-h-full max-w-full rounded-sm object-contain"
              onLoad={(e) => setSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)}
            />
          )
        ) : g.status === "failed" ? (
          <div className="flex max-w-md flex-col items-center gap-3 text-center text-sm text-red-300">
            <AlertCircleIcon className="size-6" />
            Generation failed
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Loader2Icon className="size-6 animate-spin" />
            {g.status === "queued" ? "Queued" : `Generating${g.progress ? ` ${Math.round(g.progress * 100)}%` : "…"}`}
            {g.progress !== undefined && (
              <div className="h-0.5 w-48 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(g.progress * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {(g.outputs.length > 1 || size) && (
        <div className="flex items-center gap-3 px-6 pb-4">
          {g.outputs.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {g.outputs.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setShown(i)}
                  className={cn(
                    "size-12 shrink-0 overflow-hidden rounded-sm border opacity-60 transition hover:opacity-100",
                    i === shown && "border-white/70 opacity-100",
                  )}
                >
                  {isVideo(f) ? (
                    <video src={fileUrl("library", `${g.dir}/${f}`)} className="size-full object-cover" muted />
                  ) : (
                    <img src={fileUrl("library", `${g.dir}/${f}`)} alt="" className="size-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
          {size && <span className="ml-auto text-xs text-white/50 tabular-nums">{size}</span>}
        </div>
      )}
    </div>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={cn(
        "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition hover:bg-black/80 hover:text-white",
        side === "left" ? "left-4" : "right-[calc(22rem+1rem)]",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}

function Details({ g, model, onClose, onReuse, onDelete }: Pick<Props, "model" | "onClose" | "onReuse" | "onDelete"> & { g: Generation }) {
  const busy = g.status === "queued" || g.status === "running";
  const took = g.finishedAt ? Math.round((g.finishedAt - g.createdAt) / 1000) : undefined;
  const params = Object.entries(g.params);

  return (
    <aside className="flex min-h-0 flex-col border-l bg-card">
      <header className="flex items-start gap-3 border-b px-5 pt-5 pb-4">
        <div className="grid min-w-0 flex-1 gap-1">
          <DialogTitle className="truncate font-display text-2xl leading-none font-light">{g.modelName}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <StatusDot status={g.status} />
            {new Date(g.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {took !== undefined && g.status === "completed" && <span>· {duration(took)}</span>}
          </DialogDescription>
        </div>
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-8 shrink-0">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-6 px-5 py-5">
          {g.error && <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs break-words text-red-300">{g.error}</p>}

          <Section
            title="Prompt"
            action={
              g.prompt && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title="Copy prompt"
                  onClick={() => void navigator.clipboard.writeText(g.prompt).then(() => toast("Prompt copied"))}
                >
                  <CopyIcon className="size-3" />
                </Button>
              )
            }
          >
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap select-text">
              {g.prompt || <span className="text-muted-foreground">Empty</span>}
            </p>
          </Section>

          {params.length > 0 && (
            <Section title="Settings">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                {params.map(([key, v]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{model?.params.find((p) => p.key === key)?.label ?? key}</dt>
                    <dd className="truncate text-right tabular-nums select-text" title={String(v ?? "")}>
                      {paramText(key, v, g, model)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {Object.entries(g.inputs).map(([key, files]) => (
            <Section key={key} title={model?.inputs.find((i) => i.key === key)?.label ?? key}>
              <div className="flex flex-wrap gap-2">
                {files.map((f) => {
                  const src = fileUrl("library", `${g.dir}/refs/${f}`);
                  return isVideo(f) ? (
                    <video key={f} src={src} className="size-20 rounded-sm border object-cover" muted />
                  ) : (
                    <img key={f} src={src} alt={f} className="size-20 rounded-sm border object-cover" />
                  );
                })}
              </div>
            </Section>
          ))}
        </div>
      </ScrollArea>

      <footer className="flex items-center gap-2 border-t px-5 py-4">
        {onReuse && (
          <Button size="sm" className="flex-1" onClick={() => onReuse(g)}>
            <RotateCcwIcon /> Use again
          </Button>
        )}
        <Button variant="outline" size="icon" className="size-8" title="Show in folder" onClick={() => void api.app.showGeneration(g.id)}>
          <FolderOpenIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8 text-red-400 hover:text-red-300"
          title="Delete"
          disabled={busy}
          onClick={() => {
            if (confirm("Delete this generation and its files?")) void onDelete(g.id).then(onClose);
          }}
        >
          <Trash2Icon />
        </Button>
      </footer>
    </aside>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex h-6 items-center justify-between text-xs text-muted-foreground">
        {title}
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusDot({ status }: { status: Generation["status"] }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        status === "completed" && "bg-primary",
        status === "failed" && "bg-red-400",
        (status === "queued" || status === "running") && "animate-pulse bg-amber-400",
      )}
      title={status}
    />
  );
}

function paramText(key: string, v: ParamValue, g: Generation, model?: ModelConfig): string {
  if (v === null || v === "") return key === "seed" && g.seed !== undefined ? `${g.seed} (random)` : "auto";
  const param = model?.params.find((p) => p.key === key);
  if (typeof v === "boolean") return v ? "on" : "off";
  if (param?.type === "select") return paramOptions(param).find((o) => String(o.value) === String(v))?.label ?? String(v);
  return param?.suffix ? `${v} ${param.suffix}` : String(v);
}

function duration(s: number): string {
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}
