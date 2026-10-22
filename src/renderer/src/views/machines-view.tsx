import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ModelConfig } from "@shared/model";
import type { Instance, ProviderState } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HistoryList } from "@/components/history-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAMES = { runpod: "RunPod", vast: "Vast.ai" };

type Props = { models: ModelConfig[]; onSettings: () => void; onRedeploy: (prompt: string) => void; version: number };

export function MachinesView({ models, onSettings, onRedeploy, version }: Props) {
  const [state, setState] = useState<ProviderState[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("now");
  const [polls, setPolls] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setState(await api.machines.list());
    setPolls((n) => n + 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh, version]);

  const running = state?.flatMap((p) => p.instances).filter((i) => i.status === "running" || i.status === "starting") ?? [];
  const spend = running.reduce((s, i) => s + i.costPerHour, 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <span className="text-sm font-medium">Machines</span>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-7">
            <TabsTrigger value="now" className="text-xs">
              Now
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              History
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {state && (
          <span className="text-xs text-muted-foreground">
            {running.length} running · {money(spend)}/h
          </span>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCwIcon className={cn(loading && "animate-spin")} /> Refresh
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {tab === "history" && <HistoryList onRedeploy={onRedeploy} version={version + polls} />}
        <div className={cn("grid gap-4 p-4 xl:grid-cols-2", tab !== "now" && "hidden")}>
          {state?.map((p) => (
            <Card key={p.provider} className="gap-3">
              <CardHeader className="flex flex-row items-baseline justify-between">
                <CardTitle className="text-base">{NAMES[p.provider]}</CardTitle>
                {p.balance !== undefined && <span className="text-sm tabular-nums">Balance {money(p.balance)}</span>}
              </CardHeader>
              <CardContent className="grid gap-2">
                {p.keySource === "none" ? (
                  <p className="text-sm text-muted-foreground">
                    No API key.{" "}
                    <button type="button" className="underline" onClick={onSettings}>
                      Add one in Settings
                    </button>
                  </p>
                ) : p.error ? (
                  <p className="text-sm text-red-400">{p.error}</p>
                ) : p.instances.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No instances.</p>
                ) : (
                  p.instances.map((i) => <InstanceRow key={i.id} inst={i} models={usedBy(i, models)} />)
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function InstanceRow({ inst, models }: { inst: Instance; models: ModelConfig[] }) {
  const color = { running: "bg-primary", starting: "bg-amber-400", stopped: "bg-muted-foreground/50", exited: "bg-muted-foreground/30", unknown: "bg-muted-foreground/30" }[inst.status];
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
      <span className={cn("size-2 shrink-0 rounded-full", color)} />
      <div className="min-w-0 flex-1">
        <div className="truncate">{inst.name}</div>
        <div className="text-xs text-muted-foreground">
          {inst.gpuCount}× {inst.gpu} · {inst.status} · <span className="font-mono">{inst.id}</span>
        </div>
        {models.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {models.map((m) => (
              <Badge key={m.id} variant="secondary" className="font-normal">
                {m.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {money(inst.costPerHour)}/h
        {inst.status !== "running" && inst.status !== "starting" && <div className="text-[10px]">when running</div>}
      </span>
    </div>
  );
}

function usedBy(inst: Instance, models: ModelConfig[]): ModelConfig[] {
  return models.filter(({ host: h }) =>
    inst.provider === "runpod"
      ? h.type === "runpod" && (h.pod === inst.id || h.podName === inst.name)
      : h.type === "vast" && (String(h.instance) === inst.id || h.label === inst.name),
  );
}
