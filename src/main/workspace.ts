// Prepares ~/Dernity on every start: folders, the agent instructions shipped with the app, the deny rules
// that keep the private library away from the agent, and the model schema the agent writes against.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DeploymentSchema } from "@shared/history";
import { ModelConfigSchema } from "@shared/model";
import { CHAT_FILES, CHATS, LIBRARY, MODELS, SECRETS, STATUS, WORKFLOWS, WORKSPACE, templateDir } from "./paths";

// Files from the template that belong to the user once copied; everything else is managed and refreshed.
const USER_OWNED = new Set(["NOTES.md"]);

export function setupWorkspace(): void {
  for (const dir of [WORKSPACE, MODELS, WORKFLOWS, STATUS, LIBRARY, CHATS, CHAT_FILES]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(SECRETS, { recursive: true, mode: 0o700 });
  copyTemplate(templateDir(), WORKSPACE);
  writeJson(path.join(WORKSPACE, ".claude", "settings.json"), agentSettings());
  writeJson(path.join(STATUS, "model.schema.json"), z.toJSONSchema(ModelConfigSchema, { io: "input" }));
  writeJson(path.join(STATUS, "deployment.schema.json"), z.toJSONSchema(DeploymentSchema, { io: "input" }));
}

function copyTemplate(from: string, to: string): void {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copyTemplate(src, dst);
    } else if (!USER_OWNED.has(entry.name) || !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
    }
  }
}

// Claude Code settings: permission rules block its file tools; the sandbox rules also cover shell commands
// once the user turns the sandbox on (off by default, since it asks before each new network domain).
// Absolute paths are written with a leading "//".
export function agentSettings(library = LIBRARY, chats = CHATS) {
  const abs = (p: string) => "/" + p.split(path.sep).join("/");
  const dirs = [library, chats].map((d) => `${abs(d)}`);
  return {
    permissions: { deny: dirs.flatMap((dir) => ["Read", "Edit", "Write"].map((tool) => `${tool}(${dir}/**)`)) },
    sandbox: { filesystem: { denyRead: dirs, denyWrite: dirs } },
  };
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
