// Bottom panel with terminals: the user's shell in the agent workspace, or an agent CLI started in it.
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { PlusIcon, SquareTerminalIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DetectedCli } from "@shared/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tab = { id: string; title: string; exited?: boolean };

// Output is buffered per session so a terminal can be re-attached (React remounts, hidden tabs).
const MAX_BUFFER = 400_000;
const buffers = new Map<string, string>();
const sinks = new Map<string, (data: string) => void>();

api.terminals.onData((id, data) => {
  buffers.set(id, ((buffers.get(id) ?? "") + data).slice(-MAX_BUFFER));
  sinks.get(id)?.(data);
});

export type AgentRequest = { n: number; prompt?: string };

// agentRequest: bump `n` to open a new terminal with the first agent CLI found, optionally with a first prompt.
export function TerminalDock({ open, onClose, agentRequest }: { open: boolean; onClose: () => void; agentRequest: AgentRequest }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [clis, setClis] = useState<DetectedCli[]>([]);
  const [height, setHeight] = useState(320);

  useEffect(() => {
    void api.terminals.detect().then(setClis);
    return api.terminals.onExit((id) => setTabs((t) => t.map((x) => (x.id === id ? { ...x, exited: true } : x))));
  }, []);

  const start = async (command?: string, prompt?: string) => {
    const id = await api.terminals.create(command, prompt);
    const title = command ? (clis.find((c) => c.command === command)?.name ?? command) : "Shell";
    setTabs((t) => [...t, { id, title }]);
    setActive(id);
  };

  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (agentRequest.n === 0) return;
    void api.terminals.detect().then((found) => startRef.current(found[0]?.command, agentRequest.prompt));
  }, [agentRequest]);

  const close = (id: string) => {
    api.terminals.kill(id);
    buffers.delete(id);
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id);
      if (active === id) setActive(next.at(-1)?.id ?? null);
      return next;
    });
  };

  const onDrag = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = height;
    const move = (ev: PointerEvent) => setHeight(Math.min(window.innerHeight - 120, Math.max(140, startH + startY - ev.clientY)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className={cn("flex shrink-0 flex-col border-t bg-background", !open && "hidden")} style={{ height }}>
      <div className="h-1 cursor-row-resize hover:bg-primary/30" onPointerDown={onDrag} />
      <div className="flex items-center gap-1 border-b px-2 pb-1">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-center gap-1 rounded-md px-2 py-1 text-xs",
              active === t.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <button type="button" onClick={() => setActive(t.id)} className={cn(t.exited && "line-through")}>
              {t.title}
            </button>
            <button type="button" onClick={() => close(t.id)} className="opacity-50 hover:opacity-100" aria-label="Close terminal">
              <XIcon className="size-3" />
            </button>
          </div>
        ))}
        <NewTerminalMenu clis={clis} onStart={start} />
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose} aria-label="Hide terminal">
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        {tabs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <SquareTerminalIcon className="size-6" />
            <p>Start your agent in the Dernity workspace. It already knows how to deploy and connect models.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {clis.map((c) => (
                <Button key={c.command} variant="outline" size="sm" onClick={() => void start(c.command)}>
                  {c.name}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => void start()}>
                Shell
              </Button>
            </div>
          </div>
        )}
        {tabs.map((t) => (
          <TerminalView key={t.id} id={t.id} visible={open && active === t.id} />
        ))}
      </div>
    </div>
  );
}

function NewTerminalMenu({ clis, onStart }: { clis: DetectedCli[]; onStart: (command?: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6" aria-label="New terminal">
          <PlusIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs">Agents found on this computer</DropdownMenuLabel>
        {clis.map((c) => (
          <DropdownMenuItem key={c.command} onSelect={() => onStart(c.command)}>
            {c.name}
            <span className="ml-auto pl-4 text-xs text-muted-foreground">{c.command}</span>
          </DropdownMenuItem>
        ))}
        {clis.length === 0 && <DropdownMenuItem disabled>None found in PATH</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onStart()}>Shell</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TerminalView({ id, visible }: { id: string; visible: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: { background: "#060806", foreground: "#edf2e4", cursor: "#76b900", selectionBackground: "#263a00" },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon((_e, url) => window.open(url)));
    term.open(el.current!);
    fit.current = fitAddon;
    term.write(buffers.get(id) ?? "");
    sinks.set(id, (d) => term.write(d));
    const input = term.onData((d) => api.terminals.write(id, d));
    const resize = term.onResize(({ cols, rows }) => api.terminals.resize(id, cols, rows));
    const observer = new ResizeObserver(() => {
      if (el.current?.offsetParent) fitAddon.fit();
    });
    observer.observe(el.current!);
    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      sinks.delete(id);
      term.dispose();
    };
  }, [id]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fit.current?.fit());
  }, [visible]);

  return <div ref={el} className={cn("absolute inset-0 px-2 py-1", !visible && "invisible")} />;
}
