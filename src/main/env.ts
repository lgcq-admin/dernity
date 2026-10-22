// GUI apps on Linux/macOS start without the user's shell environment (PATH from ~/.bashrc, nvm, ~/.local/bin).
// Load it once from a login shell so CLI detection, ssh and apiKeyEnv see what the user's terminal sees.
import { execFile } from "node:child_process";

const MARK = "__DERNITY_ENV__";

export function userShell(): string {
  if (process.platform === "win32") return process.env.COMSPEC || "powershell.exe";
  return process.env.SHELL || "/bin/bash";
}

export async function loadShellEnv(): Promise<void> {
  if (process.platform === "win32") return;
  const out = await new Promise<string>((resolve) => {
    execFile(
      userShell(),
      ["-ilc", `printf '${MARK}'; env -0; printf '${MARK}'`],
      { timeout: 10000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, DISABLE_AUTO_UPDATE: "true" } },
      (_err, stdout) => resolve(stdout ?? ""),
    );
  });
  const body = out.split(MARK)[1];
  if (!body) return;
  for (const line of body.split("\0")) {
    const i = line.indexOf("=");
    if (i > 0) process.env[line.slice(0, i)] = line.slice(i + 1);
  }
}

let lastRefresh = 0;

// Throttled re-read for values the user adds while the app runs (e.g. a DERNITY_* server token).
export async function refreshShellEnv(): Promise<void> {
  if (Date.now() - lastRefresh < 30_000) return;
  lastRefresh = Date.now();
  await loadShellEnv();
}
