import { AlertTriangleIcon, BookOpenTextIcon, ImageIcon, LibraryIcon, MessageSquareIcon, PlusIcon, ServerIcon, SettingsIcon, SquareTerminalIcon, Trash2Icon, VideoIcon } from "lucide-react";
import type { ModelConfig } from "@shared/model";
import type { ChatSummary } from "@shared/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelsState } from "@/hooks/use-data";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Mark, Wordmark } from "./logo";
import { StatusDot, statusText } from "./model-status";

export type View =
  | { type: "home" }
  | { type: "model"; id: string }
  | { type: "chat"; id: string }
  | { type: "library" }
  | { type: "machines" }
  | { type: "bestiary"; id?: string };

const KIND_ICON = { chat: MessageSquareIcon, image: ImageIcon, video: VideoIcon };

type Props = {
  view: View;
  setView: (v: View) => void;
  models: ModelsState;
  chats: ChatSummary[];
  onNewChat: (model: ModelConfig) => void;
  onDeleteChat: (id: string) => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  onSettings: () => void;
};

export function AppSidebar({ view, setView, models, chats, onNewChat, onDeleteChat, terminalOpen, onToggleTerminal, onSettings }: Props) {
  const modelName = (id: string) => models.models.find((m) => m.id === id)?.name ?? id;
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <button type="button" onClick={() => setView({ type: "home" })} className="flex items-center gap-2 px-4 pt-4 pb-3 text-left">
        <Mark className="size-5" />
        <Wordmark className="text-lg leading-none" />
      </button>

      <nav className="grid gap-0.5 px-2">
        <NavItem icon={LibraryIcon} label="Library" active={view.type === "library"} onClick={() => setView({ type: "library" })} />
        <NavItem icon={ServerIcon} label="Machines" active={view.type === "machines"} onClick={() => setView({ type: "machines" })} />
        <NavItem icon={BookOpenTextIcon} label="Bestiary" active={view.type === "bestiary"} onClick={() => setView({ type: "bestiary" })} />
      </nav>

      <ScrollArea className="mt-3 min-h-0 flex-1">
        <Section title="Models">
          {models.models.map((m) => {
            const Icon = KIND_ICON[m.kind];
            const active = view.type === "model" && view.id === m.id;
            return (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild>
                  <div className={cn("group flex items-center rounded-md hover:bg-sidebar-accent", active && "bg-sidebar-accent")}>
                    <button
                      type="button"
                      onClick={() => (m.kind === "chat" ? onNewChat(m) : setView({ type: "model", id: m.id }))}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{m.name}</span>
                      <StatusDot health={models.health[m.id]} className="ml-auto" onCheck={() => void models.check(m.id)} />
                    </button>
                    {m.kind === "chat" && (
                      <PlusIcon className="mr-2 hidden size-3.5 text-muted-foreground group-hover:block" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  {statusText(models.health[m.id])}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {models.invalid.length > 0 && (
            <button
              type="button"
              onClick={() => setView({ type: "home" })}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-amber-400 hover:underline"
            >
              <AlertTriangleIcon className="size-3.5" />
              {models.invalid.length} invalid config{models.invalid.length > 1 ? "s" : ""}
            </button>
          )}
          {models.models.length === 0 && models.invalid.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No models yet. Ask your agent in the terminal.</p>
          )}
        </Section>

        {chats.length > 0 && (
          <Section title="Chats">
            {chats.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center rounded-md hover:bg-sidebar-accent",
                  view.type === "chat" && view.id === c.id && "bg-sidebar-accent",
                )}
              >
                <button type="button" onClick={() => setView({ type: "chat", id: c.id })} className="min-w-0 flex-1 px-2 py-1.5 text-left">
                  <div className="truncate text-sm">{c.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {modelName(c.modelId)} · {timeAgo(c.updatedAt)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => confirm("Delete this chat?") && onDeleteChat(c.id)}
                  className="mr-2 hidden text-muted-foreground hover:text-red-400 group-hover:block"
                  aria-label="Delete chat"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            ))}
          </Section>
        )}
      </ScrollArea>

      <div className="grid gap-0.5 border-t p-2">
        <NavItem icon={SquareTerminalIcon} label="Terminal" hint="Ctrl+`" active={terminalOpen} onClick={onToggleTerminal} />
        <NavItem icon={SettingsIcon} label="Settings" onClick={onSettings} />
        <a
          href="https://lgcq.group"
          target="_blank"
          rel="noreferrer"
          className="px-2 pt-1 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
        >
          Built by lgcq.group
        </a>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 px-2">
      <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">{children}</div>
    </div>
  );
}

function NavItem({ icon: Icon, label, hint, active, onClick }: { icon: typeof ServerIcon; label: string; hint?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent", active && "bg-sidebar-accent")}
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
      {hint && <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  );
}
