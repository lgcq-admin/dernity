// Bestiary: the agent's guides to every model the user has run, as cards you can act on. Examples and
// recommended settings open in the Studio with the form filled in.
import {
  AlertTriangleIcon,
  BookOpenTextIcon,
  CheckIcon,
  CopyIcon,
  CpuIcon,
  ExternalLinkIcon,
  ImageIcon,
  MessageSquareIcon,
  SearchIcon,
  SparklesIcon,
  SquareTerminalIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import type { BestiaryEntry, BestiaryFile } from "@shared/bestiary";
import type { ModelConfig, ParamValue, ParamValues } from "@shared/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_ICON = { chat: MessageSquareIcon, image: ImageIcon, video: VideoIcon };
const KINDS = ["all", "image", "video", "chat"] as const;

export type Preset = { modelId: string; prompt?: string; params?: ParamValues };

type Props = {
  entries: BestiaryEntry[];
  invalid: BestiaryFile[];
  models: ModelConfig[];
  selected?: string;
  onSelect: (id: string) => void;
  onTry: (preset: Preset) => void;
  onAskAgent: (prompt: string) => void;
};

export function BestiaryView({ entries, invalid, models, selected, onSelect, onTry, onAskAgent }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => kind === "all" || e.kind === kind)
      .filter((e) => !q || [e.name, e.summary, e.repo ?? "", ...e.tasks].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, query, kind]);

  const current = entries.find((e) => e.id === selected) ?? shown[0];

  if (entries.length === 0) return <Empty invalid={invalid} models={models} onAskAgent={onAskAgent} />;

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r">
        <div className="grid gap-2 border-b p-3">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 pl-8" placeholder="Search models, tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex rounded-md border bg-input/30 p-0.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "flex-1 rounded-sm py-1 text-xs text-muted-foreground capitalize transition-colors hover:text-foreground",
                  kind === k && "bg-secondary text-foreground shadow-xs ring-1 ring-white/10",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-0.5 p-2">
            {shown.map((e) => {
              const Icon = KIND_ICON[e.kind];
              const live = models.some((m) => e.models.includes(m.id));
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelect(e.id)}
                  className={cn("grid gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent", current?.id === e.id && "bg-accent")}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{e.name}</span>
                    {live && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" title="Configured in the app" />}
                  </span>
                  <span className="truncate pl-5.5 text-xs text-muted-foreground">{e.tasks.join(" · ") || e.repo}</span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">Nothing matches.</p>}
          </div>
        </ScrollArea>
        {invalid.length > 0 && (
          <p className="flex items-start gap-2 border-t p-3 text-xs text-amber-400" title={invalid.map((f) => `${f.file}: ${f.error}`).join("\n")}>
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            {invalid.length} guide{invalid.length > 1 ? "s" : ""} with errors (see .dernity/bestiary-status.json)
          </p>
        )}
      </div>

      <ScrollArea key={current?.id} className="min-w-0 flex-1">
        {current && <Guide key={current.id} entry={current} models={models} onTry={onTry} onAskAgent={onAskAgent} />}
      </ScrollArea>
    </div>
  );
}

function Guide({ entry, models, onTry, onAskAgent }: { entry: BestiaryEntry } & Pick<Props, "models" | "onTry" | "onAskAgent">) {
  const Icon = KIND_ICON[entry.kind];
  const linked = models.filter((m) => entry.models.includes(m.id));
  const target = linked.find((m) => m.kind !== "chat");
  const applicable = entry.settings.filter((s) => s.key && target?.params.some((p) => p.key === s.key));
  const recommended = Object.fromEntries(applicable.map((s) => [s.key!, s.value]));

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-8 p-8">
      <header className="grid gap-3">
        <span className="flex items-center gap-2 text-xs text-muted-foreground capitalize">
          <Icon className="size-3.5" /> {entry.kind}
          {entry.repo && (
            <a href={`https://huggingface.co/${entry.repo}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 normal-case hover:text-foreground">
              · {entry.repo} <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </span>
        <h1 className="font-display text-5xl leading-none font-light">{entry.name}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-pretty text-muted-foreground">{entry.summary}</p>
        {entry.tasks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entry.tasks.map((t) => (
              <Badge key={t} variant="outline" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {target && (
            <Button size="sm" onClick={() => onTry({ modelId: target.id, params: recommended })}>
              <SparklesIcon /> Open {target.name}
              {applicable.length > 0 && " with recommended settings"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onAskAgent(
                linked.length
                  ? `Update the bestiary guide bestiary/${entry.id}.json for ${entry.name}: check the sources again and add what we learned from running it.`
                  : `Deploy ${entry.name}${entry.repo ? ` (${entry.repo})` : ""} again. Read bestiary/${entry.id}.json first and use what worked.`,
              )
            }
          >
            <SquareTerminalIcon /> {linked.length ? "Ask agent to update" : "Deploy with agent"}
          </Button>
        </div>
      </header>

      {entry.limits.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
          {entry.limits.map((l) => (
            <div key={l.label} className="grid content-start gap-1 rounded-lg border bg-card p-4">
              <span className="text-xs text-muted-foreground">{l.label}</span>
              <span className="font-display text-2xl leading-tight font-light">{l.value}</span>
              {l.note && <span className="text-xs text-muted-foreground/80">{l.note}</span>}
            </div>
          ))}
        </div>
      )}

      {entry.prompting.examples.length > 0 && (
        <Block title="Try these">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
            {entry.prompting.examples.map((ex) => (
              <Example key={ex.title} example={ex} target={target} onTry={onTry} />
            ))}
          </div>
        </Block>
      )}

      <div className="grid gap-8 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
        {entry.settings.length > 0 && (
          <Block title="Recommended settings">
            <div className="divide-y rounded-lg border bg-card">
              {entry.settings.map((s) => {
                const canApply = s.key && target?.params.some((p) => p.key === s.key);
                return (
                  <div key={s.label} className="flex items-start gap-3 p-3">
                    <div className="grid min-w-24 flex-1 gap-0.5">
                      <span className="text-sm">{s.label}</span>
                      {s.why && <span className="text-xs text-pretty text-muted-foreground">{s.why}</span>}
                    </div>
                    <code className="max-w-[50%] truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs" title={show(s.value)}>
                      {show(s.value)}
                    </code>
                    {canApply && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-my-1 h-7 shrink-0 px-2 text-xs"
                        onClick={() => onTry({ modelId: target!.id, params: { [s.key!]: s.value } })}
                      >
                        Apply
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Block>
        )}

        {(entry.prompting.tips.length > 0 || entry.prompting.avoid.length > 0) && (
          <Block title="Prompting">
            <ul className="grid gap-2 text-sm">
              {entry.prompting.tips.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-pretty">{t}</span>
                </li>
              ))}
              {entry.prompting.avoid.map((t) => (
                <li key={t} className="flex gap-2.5 text-muted-foreground">
                  <XIcon className="mt-0.5 size-4 shrink-0 text-red-400" />
                  <span className="text-pretty">{t}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>

      {entry.hardware.length > 0 && (
        <Block title="Where it ran">
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">GPU</th>
                  <th className="px-3 py-2 text-left font-normal">Result</th>
                  <th className="px-3 py-2 text-left font-normal">Speed</th>
                  <th className="px-3 py-2 text-right font-normal">$/h</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entry.hardware.map((h, i) => (
                  <tr key={`${h.gpu}-${i}`} className="bg-card">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <CpuIcon className="size-3.5 text-muted-foreground" />
                        {h.gpu}
                        {h.vramGb && <span className="text-xs text-muted-foreground">{h.vramGb} GB</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2" title={h.note}>
                      <span className={cn("text-xs", h.fits ? "text-primary" : "text-red-400")}>{h.fits ? "Fits" : "Didn't fit"}</span>
                      {h.note && <span className="block text-xs text-muted-foreground">{h.note}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{h.speed ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.pricePerHour !== undefined ? money(h.pricePerHour) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      {entry.gotchas.length > 0 && (
        <Block title="Gotchas">
          <div className="grid gap-2">
            {entry.gotchas.map((g) => (
              <p key={g} className="flex gap-2.5 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-pretty">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-400" />
                {g}
              </p>
            ))}
          </div>
        </Block>
      )}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
        {entry.sources.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
            {s.label} <ExternalLinkIcon className="size-3" />
          </a>
        ))}
        <span className="ml-auto">Updated {new Date(entry.updatedAt).toLocaleDateString()}</span>
      </footer>
    </div>
  );
}

function Example({
  example,
  target,
  onTry,
}: {
  example: BestiaryEntry["prompting"]["examples"][number];
  target?: ModelConfig;
  onTry: (p: Preset) => void;
}) {
  const [open, setOpen] = useState(false);
  const params = Object.entries(example.params ?? {});
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <span className="text-sm font-medium">{example.title}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("text-left text-sm leading-relaxed text-muted-foreground", !open && "line-clamp-4")}
        title={open ? undefined : "Show all"}
      >
        {example.prompt}
      </button>
      {params.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {params.map(([k, v]) => (
            <span key={k} className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {k} {show(v)}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex gap-2">
        {target && (
          <Button size="sm" className="flex-1" onClick={() => onTry({ modelId: target.id, prompt: example.prompt, params: example.params })}>
            <SparklesIcon /> Try in {target.name}
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          title="Copy prompt"
          onClick={() => void navigator.clipboard.writeText(example.prompt).then(() => toast("Prompt copied"))}
        >
          <CopyIcon />
        </Button>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
      <h2 className="font-display text-2xl leading-none font-light">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ invalid, models, onAskAgent }: Pick<Props, "invalid" | "models" | "onAskAgent">) {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-5 p-8">
      <BookOpenTextIcon className="size-8 text-primary" />
      <h1 className="font-display text-5xl leading-none font-light">Bestiary</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        A guide to every model you run: what it can do, its limits, prompts that work, settings worth using, and which GPUs it
        fit on. Your agent writes a guide after each deploy and reads it before the next one, so it doesn't learn the same lesson
        twice.
      </p>
      {models.length > 0 && (
        <Button
          className="w-fit"
          onClick={() =>
            onAskAgent(
              `Write bestiary guides for my models (${models.map((m) => m.id).join(", ")}), following the bestiary skill.`,
            )
          }
        >
          <SquareTerminalIcon /> Ask agent to write guides for your models
        </Button>
      )}
      {invalid.length > 0 && (
        <p className="text-xs text-amber-400">
          {invalid.length} guide file{invalid.length > 1 ? "s" : ""} couldn't be read: {invalid.map((f) => f.file).join(", ")}
        </p>
      )}
    </div>
  );
}

function show(v: ParamValue): string {
  return v === null ? "auto" : typeof v === "boolean" ? (v ? "on" : "off") : String(v);
}
