import { AlertTriangleIcon, FolderOpenIcon, SquareTerminalIcon } from "lucide-react";
import type { ModelEntry } from "@shared/model";
import { Mark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const EXAMPLES = [
  "Deploy Qwen3-32B for chat on the cheapest reliable GPU",
  "Deploy Wan 2.2 image-to-video with first and last frame",
  "Connect my running Vast instance krea-noct-v4 (ComfyUI on port 8188)",
  "What can the model wan-i2v do? Update its config",
];

export function HomeView({ invalid, onAskAgent }: { invalid: ModelEntry[]; onAskAgent: (prompt?: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-6 p-8">
      <div className="grid gap-2">
        <Mark className="mb-2 size-10" />
        <h1 className="mb-1 font-display text-5xl leading-none font-light">Your models, your GPUs</h1>
        <p className="text-sm text-muted-foreground">
          Open a terminal with your agent and tell it what you want. It works in the Dernity workspace, writes model configs, and
          the app picks them up right away.
        </p>
      </div>
      <div className="grid gap-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onAskAgent(e)}
            className="group flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent hover:text-foreground"
          >
            “{e}”
            <SquareTerminalIcon className="ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onAskAgent()}>
          <SquareTerminalIcon /> Open agent terminal
        </Button>
        <Button variant="outline" onClick={() => void api.app.openPath("workspace")}>
          <FolderOpenIcon /> Workspace folder
        </Button>
      </div>
      {invalid.length > 0 && (
        <div className="grid gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertTriangleIcon className="size-4" /> Configs that didn't load
          </div>
          {invalid.map((e) => (
            <div key={e.file} className="text-xs">
              <code>models/{e.file}</code>
              <p className="text-muted-foreground">{e.error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
