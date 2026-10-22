// Image/video generations. Each one is a folder library/<date>/<id>/ with meta.json (prompt, params,
// model, status), refs/ (input files) and the outputs. Main owns the job: it submits, polls and downloads,
// so closing or reloading the window loses nothing, and unfinished jobs resume on the next start.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Generation, GenerationRequest } from "@shared/types";
import { generationAdapter } from "./adapters";
import type { JobFile } from "./adapters/types";
import { connect } from "./hosts";
import { getModel } from "./models";
import { inside, LIBRARY } from "./paths";

const POLL_MS = 2000;
const GIVE_UP_MS = 30 * 60_000; // backend unreachable this long -> failed

const listeners = new Set<(g: Generation) => void>();
export const onGenerationUpdate = (cb: (g: Generation) => void) => listeners.add(cb);

const metaPath = (g: Pick<Generation, "dir">) => path.join(LIBRARY, g.dir, "meta.json");

function save(g: Generation): void {
  fs.writeFileSync(metaPath(g), JSON.stringify(g, null, 2) + "\n");
  for (const cb of listeners) cb(g);
}

export function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "_").trim();
  return base && base !== "." && base !== ".." ? base : "file";
}

export function listGenerations(): Generation[] {
  if (!fs.existsSync(LIBRARY)) return [];
  const out: Generation[] = [];
  for (const day of fs.readdirSync(LIBRARY)) {
    const dayDir = path.join(LIBRARY, day);
    if (!fs.statSync(dayDir).isDirectory()) continue;
    for (const id of fs.readdirSync(dayDir)) {
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(dayDir, id, "meta.json"), "utf8")));
      } catch {
        // not a generation folder
      }
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function find(id: string): Generation {
  const g = listGenerations().find((x) => x.id === id);
  if (!g) throw new Error(`Generation ${id} not found`);
  return g;
}

export function generationDir(id: string): string {
  return path.join(LIBRARY, find(id).dir);
}

export function submitGeneration(req: GenerationRequest): Generation {
  const model = getModel(req.modelId);
  if (model.kind === "chat") throw new Error(`${model.name} is a chat model`);
  for (const input of model.inputs) {
    const count = req.files[input.key]?.length ?? 0;
    if (input.required && count === 0) throw new Error(`${input.label} is required`);
    if (count > input.max) throw new Error(`${input.label}: at most ${input.max}`);
  }

  const now = new Date();
  const id = `${now.toISOString().slice(11, 19).replace(/:/g, "")}-${randomBytes(3).toString("hex")}`;
  const dir = `${now.toISOString().slice(0, 10)}/${id}`;
  const refsDir = path.join(LIBRARY, dir, "refs");
  fs.mkdirSync(refsDir, { recursive: true });

  const inputs: Record<string, string[]> = {};
  for (const [key, files] of Object.entries(req.files)) {
    if (!model.inputs.some((i) => i.key === key)) continue;
    inputs[key] = files.map((f, i) => {
      const name = `${key}-${i + 1}-${safeFileName(f.name)}`;
      fs.writeFileSync(path.join(refsDir, name), f.data);
      return name;
    });
  }

  const g: Generation = {
    id,
    dir,
    createdAt: now.getTime(),
    modelId: model.id,
    modelName: model.name,
    kind: model.kind,
    prompt: req.prompt,
    params: req.params,
    // Resolve an auto seed here so the generation can be reproduced from its meta.json.
    ...("seed" in req.params && (req.params.seed === null || req.params.seed === "") ? { seed: Math.floor(Math.random() * 2 ** 32) } : {}),
    inputs,
    outputs: [],
    status: "queued",
  };
  save(g);
  void run(g);
  return g;
}

export function removeGeneration(id: string): void {
  const g = find(id);
  const dir = inside(LIBRARY, g.dir);
  if (!dir || g.status === "queued" || g.status === "running") throw new Error("Can't delete a running generation");
  fs.rmSync(dir, { recursive: true, force: true });
}

export function resumeGenerations(): void {
  for (const g of listGenerations()) {
    if (g.status === "queued" || g.status === "running") void run(g);
  }
}

const running = new Set<string>();

async function run(g: Generation): Promise<void> {
  if (running.has(g.id)) return;
  running.add(g.id);
  try {
    const model = getModel(g.modelId);
    const adapter = generationAdapter(model);
    let conn = await connect(model);

    if (!g.remoteId) {
      const files: Record<string, JobFile[]> = {};
      for (const [key, names] of Object.entries(g.inputs)) {
        files[key] = names.map((name) => ({ name, type: mimeOf(name), path: path.join(LIBRARY, g.dir, "refs", name) }));
      }
      const params = g.seed === undefined ? g.params : { ...g.params, seed: g.seed };
      g.remoteId = await adapter.submit(conn, model, { prompt: g.prompt, params, files });
      save(g);
    }

    let lastOk = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      let state;
      try {
        state = await adapter.poll(conn, model, g.remoteId);
        lastOk = Date.now();
      } catch (err) {
        if (Date.now() - lastOk > GIVE_UP_MS) throw err;
        conn = await connect(model).catch(() => conn); // tunnel may have dropped
        continue;
      }
      if (state.status === "failed") throw new Error(state.error ?? "Generation failed");
      if (state.status === "completed") break;
      if (state.status !== g.status || state.progress !== g.progress) {
        g.status = state.status;
        g.progress = state.progress;
        save(g);
      }
    }

    const outputs = await adapter.outputs(conn, model, g.remoteId);
    g.outputs = outputs.map((o, i) => {
      const name = `output-${i + 1}${path.extname(o.name) || ".bin"}`;
      fs.writeFileSync(path.join(LIBRARY, g.dir, name), o.data);
      return name;
    });
    g.status = "completed";
    g.progress = 1;
  } catch (err) {
    g.status = "failed";
    g.error = (err as Error).message;
  } finally {
    g.finishedAt = Date.now();
    running.delete(g.id);
    save(g);
  }
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export const mimeOf = (name: string) => MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
