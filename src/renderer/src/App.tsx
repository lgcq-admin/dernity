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
import { findModel, useChats, useGenerations, useModels } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { newId } from "@/lib/format";
import { ChatView } from "@/views/chat-view";
import { HomeView } from "@/views/home-view";
import { LibraryView } from "@/views/library-view";
import { MachinesView } from "@/views/machines-view";
import { StudioView } from "@/views/studio-view";

export function App() {
  const models = useModels();
  const generations = useGenerations();
  const { chats, refresh: refreshChats } = useChats();
  const [view, setView] = useState<View>({ type: "home" });
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [agentRequest, setAgentRequest] = useState<AgentRequest>({ n: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysVersion, setKeysVersion] = useState(0);
  const [opened, setOpened] = useState<Generation | null>(null);
  const [reuse, setReuse] = useState<Generation | null>(null);

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
            {view.type === "home" && <HomeView invalid={models.invalid} onAskAgent={() => askAgent()} />}
            {view.type === "library" && <LibraryView generations={generations.items} onOpen={setOpened} />}
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
          </main>
          <TerminalDock open={terminalOpen} onClose={() => setTerminalOpen(false)} agentRequest={agentRequest} />
        </div>
      </div>
      <GenerationDialog
        g={openedLive}
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
      <StudioView key={id} model={model} health={models.health[id]} onCheck={() => void models.check(id)} generations={generations.items} reuse={reuse} onOpen={setOpened} />
    );
  }
}
