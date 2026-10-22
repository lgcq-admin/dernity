// Built-in terminals: the user's own shell in the agent workspace, optionally starting an agent CLI.
// CLIs run with the user's login environment, so they're already authenticated, same as in any terminal.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as pty from "node-pty";
import type { DetectedCli } from "@shared/types";
import { userShell } from "./env";
import { shellQuote } from "./shell-quote";
import { WORKSPACE } from "./paths";

// Agent CLIs worth offering, by executable name.
export const KNOWN_CLIS: { command: string; name: string }[] = [
  { command: "claude", name: "Claude Code" },
  { command: "codex", name: "Codex" },
  { command: "gemini", name: "Gemini CLI" },
  { command: "opencode", name: "OpenCode" },
  { command: "cursor-agent", name: "Cursor Agent" },
  { command: "qwen", name: "Qwen Code" },
  { command: "aider", name: "Aider" },
  { command: "goose", name: "Goose" },
  { command: "amp", name: "Amp" },
  { command: "crush", name: "Crush" },
];

function which(command: string): Promise<string | null> {
  const finder = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) =>
    execFile(finder, [command], { timeout: 5000 }, (err, stdout) => resolve(err ? null : stdout.split(/\r?\n/)[0]!.trim() || null)),
  );
}

export async function detectClis(): Promise<DetectedCli[]> {
  const found = await Promise.all(KNOWN_CLIS.map(async (c) => ({ ...c, path: await which(c.command) })));
  return found.filter((c): c is DetectedCli => c.path !== null);
}

const sessions = new Map<string, pty.IPty>();

// CLIs that take a first prompt as a positional argument.
const PROMPT_ARG = new Set(["claude", "codex"]);

export function createTerminal(
  command: string | undefined,
  prompt: string | undefined,
  onData: (id: string, data: string) => void,
  onExit: (id: string, code: number) => void,
): string {
  if (command && !KNOWN_CLIS.some((c) => c.command === command)) throw new Error(`Unknown CLI: ${command}`);
  const id = randomUUID();
  const shell = userShell();
  const proc = pty.spawn(shell, process.platform === "win32" ? [] : ["-l"], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: WORKSPACE,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" } as Record<string, string>,
  });
  sessions.set(id, proc);
  proc.onData((d) => onData(id, d));
  proc.onExit(({ exitCode }) => {
    sessions.delete(id);
    onExit(id, exitCode);
  });
  if (command) {
    const withPrompt = prompt && PROMPT_ARG.has(command) && process.platform !== "win32";
    proc.write(withPrompt ? `${command} ${shellQuote(prompt)}\r` : `${command}\r`);
  }
  return id;
}

export const writeTerminal = (id: string, data: string) => sessions.get(id)?.write(data);

export function resizeTerminal(id: string, cols: number, rows: number): void {
  if (cols > 0 && rows > 0) sessions.get(id)?.resize(Math.floor(cols), Math.floor(rows));
}

export function killTerminal(id: string): void {
  sessions.get(id)?.kill();
  sessions.delete(id);
}

export function killAllTerminals(): void {
  for (const p of sessions.values()) p.kill();
  sessions.clear();
}
