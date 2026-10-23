import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ModelConfig } from "@shared/model";
import type { Generation } from "@shared/types";
import { AppSidebar, type View } from "@/components/app-sidebar";
import { GenerationDialog } from "@/components/generation-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { type AgentRequest, TerminalDock } from "@/components/terminal-dock";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { guideFor } from "@shared/bestiary";
import { findModel, useBestiary, useChats, useGenerations, useModels } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { newId } from "@/lib/format";
import { BestiaryView, type Preset } from "@/views/bestiary-view";
import { ChatView } from "@/views/chat-view";
import { HomeView } from "@/views/home-view";
import { LibraryView } from "@/views/library-view";
import { MachinesView } from "@/views/machines-view";
import { StudioView } from "@/views/studio-view";

export function App() {
  const models = useModels();
  const generations = useGenerations();
  const bestiary = useBestiary();
  const { chats, refresh: refreshChats } = useChats();
  const [view, setView] = useState<View>({ type: "home" });
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [agentRequest, setAgentRequest] = useState<AgentRequest>({ n: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysVersion, setKeysVersion] = useState(0);
  const [opened, setOpened] = useState<Generation | null>(null);
  const [openedFrom, setOpenedFrom] = useState<string[]>([]);
  const [reuse, setReuse] = useState<Generation | null>(null);
  const [preset, setPreset] = useState<(Preset & { n: number }) | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setTerminalOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const newChat = useCallback(
    async (model: ModelConfig) => {
      const empty = chats.find((c) => c.modelId === model.id && c.title === "New chat");
      if (empty) return setView({ type: "chat", id: empty.id });
      const now = Date.now();
      const id = newId();
      await api.chats.save({ id, title: "New chat", modelId: model.id, createdAt: now, updatedAt: now, messages: [] });
      refreshChats();
      setView({ type: "chat", id });
    },
    [chats, refreshChats],
  );

  const deleteChat = async (id: string) => {
    await api.chats.remove(id);
    refreshChats();
    if (view.type === "chat" && view.id === id) setView({ type: "home" });
  };

  const askAgent = (prompt?: string) => {
    setTerminalOpen(true);
    setAgentRequest((r) => ({ n: r.n + 1, prompt }));
    // Only some CLIs take a first prompt as an argument; the clipboard covers the rest.
    if (prompt) void navigator.clipboard.writeText(prompt).then(() => toast("Request copied, the agent is starting"));
  };

  // Keep the dialog in sync with live updates of the opened generation.
  const openedLive = opened ? (generations.items.find((g) => g.id === opened.id) ?? opened) : null;
  const openedList = openedFrom.flatMap((id) => generations.items.find((g) => g.id === id) ?? []);
  const open = (g: Generation, list: Generation[]) => {
    setOpened(g);
    setOpenedFrom(list.map((x) => x.id));
  };
  const chatModelId = view.type === "chat" ? chats.find((c) => c.id === view.id)?.modelId : undefined;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        <AppSidebar
          view={view}
          setView={setView}
          models={models}
          chats={chats}
          onNewChat={(m) => void newChat(m)}
          onDeleteChat={(id) => void deleteChat(id)}
          terminalOpen={terminalOpen}
          onToggleTerminal={() => setTerminalOpen((o) => !o)}
          onSettings={() => setSettingsOpen(true)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1">
            {view.type === "home" && <HomeView invalid={models.invalid} onAskAgent={askAgent} />}
            {view.type === "library" && <LibraryView generations={generations.items} onOpen={open} />}
            {view.type === "machines" && (
              <MachinesView models={models.models} onSettings={() => setSettingsOpen(true)} onRedeploy={askAgent} version={keysVersion} />
            )}
            {view.type === "chat" && (
              <ChatView
                key={view.id}
                chatId={view.id}
                model={chatModelId ? findModel(models.models, chatModelId) : undefined}
                health={chatModelId ? models.health[chatModelId] : undefined}
                onCheck={() => chatModelId && void models.check(chatModelId)}
                onSaved={refreshChats}
              />
            )}
            {view.type === "model" && renderStudio(view.id)}
            {view.type === "bestiary" && (
              <BestiaryView
                entries={bestiary.entries}
                invalid={bestiary.invalid}
                models={models.models}
                selected={view.id}
                onSelect={(id) => setView({ type: "bestiary", id })}
                onTry={(p) => {
                  setPreset((old) => ({ ...p, n: (old?.n ?? 0) + 1 }));
                  setView({ type: "model", id: p.modelId });
                }}
                onAskAgent={askAgent}
              />
            )}
          </main>
          <TerminalDock open={terminalOpen} onClose={() => setTerminalOpen(false)} agentRequest={agentRequest} />
        </div>
      </div>
      <GenerationDialog
        g={openedLive}
        list={openedList}
        model={openedLive ? findModel(models.models, openedLive.modelId) : undefined}
        onNavigate={setOpened}
        onClose={() => setOpened(null)}
        onDelete={generations.remove}
        onReuse={(g) => {
          setOpened(null);
          setReuse(g);
          setView({ type: "model", id: g.modelId });
        }}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={() => setKeysVersion((v) => v + 1)} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );

  function renderStudio(id: string) {
    const model = findModel(models.models, id);
    if (!model) return <p className="p-8 text-sm text-muted-foreground">Model “{id}” is not configured anymore.</p>;
    return (
      <StudioView
        key={id}
        model={model}
        health={models.health[id]}
        onCheck={() => void models.check(id)}
        generations={generations.items}
        reuse={reuse}
        preset={preset}
        guide={guideFor(bestiary.entries, id)}
        onOpenGuide={(gid) => setView({ type: "bestiary", id: gid })}
        onOpen={open}
      />
    );
  }
}
