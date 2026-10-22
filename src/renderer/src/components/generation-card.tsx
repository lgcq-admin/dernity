import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { fileUrl, type Generation } from "@shared/types";
import { isVideo } from "@/lib/files";
import { cn } from "@/lib/utils";

export function GenerationMedia({ g, file, className, controls }: { g: Generation; file: string; className?: string; controls?: boolean }) {
  const src = fileUrl("library", `${g.dir}/${file}`);
  return isVideo(file) ? (
    <video src={src} className={className} controls={controls} muted={!controls} loop playsInline autoPlay={controls} />
  ) : (
    <img src={src} alt={g.prompt} className={className} />
  );
}

export function GenerationCard({ g, onOpen }: { g: Generation; onOpen: () => void }) {
  const first = g.outputs[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left"
      title={g.prompt}
    >
      {first ? (
        <GenerationMedia
          g={g}
          file={first}
          className="size-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
          {g.status === "failed" ? (
            <AlertCircleIcon className="size-5 text-red-400" />
          ) : (
            <Loader2Icon className="size-5 animate-spin" />
          )}
          <span className={cn("line-clamp-3", g.status === "failed" && "text-red-300")}>
            {g.status === "failed" ? g.error : g.status === "queued" ? "Queued" : `Generating${g.progress ? ` ${Math.round(g.progress * 100)}%` : "…"}`}
          </span>
        </div>
      )}
      {g.outputs.length > 1 && (
        <span className="absolute top-1.5 right-1.5 rounded bg-background/80 px-1.5 text-[10px]">{g.outputs.length}</span>
      )}
      <div className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {g.prompt}
      </div>
    </button>
  );
}
