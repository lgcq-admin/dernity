import { FolderOpenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AppInfo, KeySource, Provider } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

const PROVIDERS: { id: Provider; name: string; hint: string }[] = [
  { id: "runpod", name: "RunPod", hint: "runpod.io → Settings → API Keys (read access is enough for balances)" },
  { id: "vast", name: "Vast.ai", hint: "cloud.vast.ai → Account → API Keys" },
];

const SOURCE: Record<KeySource, string> = {
  app: "Saved in Dernity (encrypted)",
  env: "From environment variable",
  cli: "From the provider CLI config",
  none: "Not set",
};

export function SettingsDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [status, setStatus] = useState<Record<Provider, KeySource> | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Provider, string>>>({});

  useEffect(() => {
    if (!open) return;
    void api.secrets.status().then(setStatus);
    void api.app.info().then(setInfo);
    setDrafts({});
  }, [open]);

  const save = async (p: Provider, key: string | null) => {
    try {
      await api.secrets.set(p, key);
      setStatus(await api.secrets.status());
      setDrafts((d) => ({ ...d, [p]: "" }));
      onSaved();
      toast(key ? "Key saved" : "Key removed");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Provider keys are used only to show balances and machines and to find the machines your models run on.
        </DialogDescription>
        {PROVIDERS.map((p) => (
          <div key={p.id} className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label>{p.name} API key</Label>
              <span className="text-xs text-muted-foreground">{status ? SOURCE[status[p.id]] : ""}</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={status?.[p.id] === "none" ? "Paste key" : "Paste a key to override"}
                value={drafts[p.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
              />
              <Button disabled={!drafts[p.id]?.trim()} onClick={() => void save(p.id, drafts[p.id]!.trim())}>
                Save
              </Button>
              {status?.[p.id] === "app" && (
                <Button variant="ghost" onClick={() => void save(p.id, null)}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{p.hint}</p>
          </div>
        ))}
        {info && (
          <div className="grid gap-2 border-t pt-4 text-xs text-muted-foreground">
            <PathRow label="Agent workspace" path={info.workspace} onOpen={() => void api.app.openPath("workspace")} />
            <PathRow label="Library (private)" path={info.library} onOpen={() => void api.app.openPath("library")} />
            <span>
              Dernity {info.version} · Built by{" "}
              <a href="https://lgcq.group" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                lgcq.group
              </a>
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PathRow({ label, path, onOpen }: { label: string; path: string; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0">{label}</span>
      <code className="truncate">{path}</code>
      <Button variant="ghost" size="icon" className="ml-auto size-6 shrink-0" onClick={onOpen}>
        <FolderOpenIcon className="size-3.5" />
      </Button>
    </div>
  );
}
