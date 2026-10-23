import { ExternalLinkIcon, FolderOpenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AppInfo, KeySource, SecretName } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const KEYS: { id: SecretName; name: string; url: string; note?: string }[] = [
  { id: "runpod", name: "RunPod", url: "https://www.runpod.io/console/user/settings" },
  { id: "vast", name: "Vast.ai", url: "https://cloud.vast.ai/manage-keys/" },
  { id: "huggingface", name: "Hugging Face", url: "https://huggingface.co/settings/tokens", note: "Agent terminals get it as HF_TOKEN" },
];

const SOURCE: Record<KeySource, string> = {
  app: "Saved",
  env: "From env",
  cli: "From CLI",
  none: "Not set",
};

export function SettingsDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [status, setStatus] = useState<Record<SecretName, KeySource> | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<SecretName, string>>>({});

  useEffect(() => {
    if (!open) return;
    void api.secrets.status().then(setStatus);
    void api.app.info().then(setInfo);
    setDrafts({});
  }, [open]);

  const save = async (id: SecretName, key: string | null) => {
    try {
      await api.secrets.set(id, key);
      setStatus(await api.secrets.status());
      setDrafts((d) => ({ ...d, [id]: "" }));
      onSaved();
      toast(key ? "Key saved" : "Key removed");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-6 sm:max-w-md [&>*]:min-w-0">
        <div className="grid gap-1">
          <DialogTitle className="font-display text-3xl leading-none font-light">Settings</DialogTitle>
          <DialogDescription className="text-xs">Keys stay on this computer, encrypted by your OS keychain.</DialogDescription>
        </div>

        <div className="grid gap-4">
          {KEYS.map((k) => {
            const source = status?.[k.id] ?? "none";
            const draft = drafts[k.id] ?? "";
            return (
              <div key={k.id} className="grid gap-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span>{k.name}</span>
                  <a href={k.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Get a key">
                    <ExternalLinkIcon className="size-3" />
                  </a>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", source === "none" ? "bg-muted-foreground/40" : "bg-primary")} />
                    {SOURCE[source]}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    className="h-8"
                    placeholder={source === "none" ? "Paste key" : "Paste to replace"}
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [k.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && draft.trim() && void save(k.id, draft.trim())}
                  />
                  {draft.trim() ? (
                    <Button size="sm" onClick={() => void save(k.id, draft.trim())}>
                      Save
                    </Button>
                  ) : (
                    source === "app" && (
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void save(k.id, null)}>
                        Remove
                      </Button>
                    )
                  )}
                </div>
                {k.note && <p className="text-xs text-muted-foreground">{k.note}</p>}
              </div>
            );
          })}
        </div>

        {info && (
          <div className="flex items-center gap-1 border-t pt-4 text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs" title={info.workspace} onClick={() => void api.app.openPath("workspace")}>
              <FolderOpenIcon /> Workspace
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" title={info.library} onClick={() => void api.app.openPath("library")}>
              <FolderOpenIcon /> Library
            </Button>
            <span className="ml-auto">
              v{info.version} ·{" "}
              <a href="https://lgcq.group" target="_blank" rel="noreferrer" className="hover:text-foreground">
                lgcq.group
              </a>
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
