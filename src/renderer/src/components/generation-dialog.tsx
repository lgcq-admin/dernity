import { CopyIcon, FolderOpenIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { fileUrl, type Generation } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { isVideo } from "@/lib/files";
import { GenerationMedia } from "./generation-card";

type Props = {
  g: Generation | null;
  onClose: () => void;
  onReuse?: (g: Generation) => void;
  onDelete: (id: string) => Promise<void>;
};

export function GenerationDialog({ g, onClose, onReuse, onDelete }: Props) {
  return (
    <Dialog open={!!g} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        {g && (
          <>
            <DialogTitle className="flex items-center gap-2 text-base">
              {g.modelName}
              <Badge variant={g.status === "failed" ? "destructive" : "secondary"}>{g.status}</Badge>
            </DialogTitle>
            <DialogDescription className="text-xs">{new Date(g.createdAt).toLocaleString()}</DialogDescription>

            {g.outputs.length > 0 && (
              <div className="grid gap-2">
                {g.outputs.map((f) => (
                  <GenerationMedia key={f} g={g} file={f} controls className="max-h-[60vh] w-full rounded-md bg-black object-contain" />
                ))}
              </div>
            )}
            {g.error && <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-300">{g.error}</p>}

            <div className="grid gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                Prompt
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => void navigator.clipboard.writeText(g.prompt).then(() => toast("Prompt copied"))}
                >
                  <CopyIcon className="size-3" />
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{g.prompt || <span className="text-muted-foreground">(empty)</span>}</p>
            </div>

            {Object.keys(g.params).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(g.params).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="font-normal">
                    {k}: {v === null ? (k === "seed" && g.seed !== undefined ? `${g.seed} (auto)` : "auto") : String(v)}
                  </Badge>
                ))}
              </div>
            )}

            {Object.entries(g.inputs).map(([key, files]) => (
              <div key={key} className="grid gap-1">
                <span className="text-xs text-muted-foreground">{key}</span>
                <div className="flex flex-wrap gap-2">
                  {files.map((f) => {
                    const src = fileUrl("library", `${g.dir}/refs/${f}`);
                    return isVideo(f) ? (
                      <video key={f} src={src} className="h-20 rounded border" muted />
                    ) : (
                      <img key={f} src={src} alt={f} className="h-20 rounded border object-cover" />
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {onReuse && (
                <Button variant="outline" size="sm" onClick={() => onReuse(g)}>
                  <RotateCcwIcon /> Use again
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void api.app.showGeneration(g.id)}>
                <FolderOpenIcon /> Open folder
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400"
                disabled={g.status === "queued" || g.status === "running"}
                onClick={() => {
                  if (confirm("Delete this generation and its files?")) void onDelete(g.id).then(onClose);
                }}
              >
                <Trash2Icon /> Delete
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
