// Past and current deployments: what ran where, for how long, and roughly what it cost.
import { ExternalLinkIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { type HistoryEntry, joinHistory, runCost, runHours } from "@shared/history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

const NAMES = { runpod: "RunPod", vast: "Vast.ai" };

export function HistoryList({ onRedeploy, version }: { onRedeploy: (prompt: string) => void; version: number }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [invalid, setInvalid] = useState(0);

  useEffect(() => {
    void api.machines.history().then((h) => {
      setEntries(joinHistory(h.machines, h.deployments));
      setInvalid(h.invalidDeployments);
    });
  }, [version]);

  if (!entries) return null;
  if (entries.length === 0) {
    return <p className="p-8 text-center text-sm text-muted-foreground">No deployments yet. Machines show up here once Dernity sees them.</p>;
  }

  return (
    <div className="grid gap-2 p-4">
      {invalid > 0 && <p className="text-xs text-amber-400">{invalid} line(s) in deployments.jsonl couldn't be read.</p>}
      {entries.map((e) => (
        <Row key={e.machine ? `${e.machine.provider}:${e.machine.id}` : e.deployment!.id} entry={e} onRedeploy={onRedeploy} />
      ))}
      <p className="pt-2 text-xs text-muted-foreground">
        Hours and cost count only the time Dernity was open and saw the machine running; check the provider's billing for exact numbers.
      </p>
    </div>
  );
}

function Row({ entry: { machine: m, deployment: d, startedAt }, onRedeploy }: { entry: HistoryEntry; onRedeploy: (prompt: string) => void }) {
  const provider = m?.provider ?? d!.provider;
  const title = d?.model ?? m!.name;
  const hours = m ? runHours(m) : 0;
  const status = m?.status ?? "not tracked";
  const price = m?.pricePerHour ?? d?.pricePerHour;

  const prompt = d
    ? `Deploy again what deployment "${d.id}" in deployments.jsonl ran (follow the redeploy skill).`
    : `Deploy again what ran on ${NAMES[provider]} machine "${m!.name}" (${m!.provider}:${m!.id} in .dernity/machines.json), following the redeploy skill.`;

  return (
    <div className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {d?.file && <span className="text-xs text-muted-foreground">{d.file}</span>}
          {d && /^[\w.-]+\/[\w.-]+$/.test(d.model) && (
            <a href={`https://huggingface.co/${d.model}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
          <Badge variant={status === "running" ? "default" : "outline"} className="font-normal">
            {status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {NAMES[provider]} · {m ? `${m.gpuCount}× ${m.gpu}` : (d?.gpu ?? "GPU")}
          {(m?.region ?? d?.region) && ` · ${m?.region ?? d?.region}`}
          {d?.runtime && ` · ${d.runtime}`}
          {m && m.name !== title && ` · ${m.name}`}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(startedAt).toLocaleString()}
          {m?.deletedAt && ` → deleted ${new Date(m.deletedAt).toLocaleString()}`}
        </div>
        {d?.notes && <div className="mt-1 text-xs">{d.notes}</div>}
      </div>
      <div className="text-right text-xs text-muted-foreground tabular-nums">
        {price !== undefined && <div>{money(price)}/h</div>}
        {m && hours > 0 && (
          <div>
            {hours.toFixed(1)} h · ≈{money(runCost(m))}
          </div>
        )}
        {m?.status === "stopped" && m.storagePerHour !== undefined && <div>disk {money(m.storagePerHour)}/h while stopped</div>}
      </div>
      <Button variant="ghost" size="icon" className="size-7 shrink-0" title="Deploy this again with your agent" onClick={() => onRedeploy(prompt)}>
        <RotateCcwIcon className="size-3.5" />
      </Button>
    </div>
  );
}
