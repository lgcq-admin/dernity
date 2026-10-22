// ComfyUI: POST /prompt with a filled workflow, poll /history and /queue, download from /view.
// Reference files go through ComfyUI's own /upload/image, so no SSH is needed.
//
// model.options:
//   workflow   path to the API-format workflow JSON, relative to workspace/workflows (required)
//   fps        default frame rate for {{frames}} (24)
//   frameStep  frames = n * frameStep + 1 (8)
//   sizeStep   width/height rounding (16)
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ModelConfig } from "@shared/model";
import type { Conn } from "../hosts";
import { inside, WORKFLOWS } from "../paths";
import { type GenerationAdapter, expectOk, type OutputFile } from "./types";
import { deriveValues, fillWorkflow, type Values } from "./workflow";

const OptionsSchema = z.object({
  workflow: z.string(),
  fps: z.number().positive().optional(),
  frameStep: z.number().int().positive().optional(),
  sizeStep: z.number().int().positive().optional(),
});

type FileRef = { filename: string; subfolder: string; type: string };
type HistoryEntry = {
  status?: { status_str?: string; completed?: boolean; messages?: [string, { exception_message?: string }][] };
  outputs?: Record<string, Record<string, FileRef[] | unknown>>;
};

function options(model: ModelConfig) {
  const parsed = OptionsSchema.safeParse(model.options);
  if (!parsed.success) throw new Error(`comfyui options: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

function loadWorkflow(rel: string): unknown {
  const file = inside(WORKFLOWS, rel);
  if (!file) throw new Error(`Workflow path escapes workspace/workflows: ${rel}`);
  if (!fs.existsSync(file)) throw new Error(`Workflow not found: workflows/${rel}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function history(conn: Conn, id: string): Promise<HistoryEntry | undefined> {
  const res = await expectOk(await conn.fetch(`/history/${id}`, { signal: AbortSignal.timeout(20000) }), "GET /history");
  return ((await res.json()) as Record<string, HistoryEntry>)[id];
}

export function outputRefs(entry: HistoryEntry): FileRef[] {
  const refs: FileRef[] = [];
  for (const node of Object.values(entry.outputs ?? {})) {
    for (const list of Object.values(node)) {
      if (!Array.isArray(list)) continue;
      for (const f of list as FileRef[]) if (f?.filename && f.type === "output") refs.push(f);
    }
  }
  return refs;
}

const comfyui: GenerationAdapter = {
  kind: "generation",

  async health(conn) {
    const res = await expectOk(await conn.fetch("/system_stats", { signal: AbortSignal.timeout(15000) }), "GET /system_stats");
    const body = (await res.json()) as { devices?: { name?: string }[] };
    return body.devices?.[0]?.name?.replace(/^cuda:\d+\s*/, "") ?? "ComfyUI";
  },

  async submit(conn, model, job) {
    const opts = options(model);
    const values: Values = deriveValues(job.prompt, job.params, opts);
    for (const [key, files] of Object.entries(job.files)) {
      for (const [i, file] of files.entries()) {
        const form = new FormData();
        form.append("image", new Blob([fs.readFileSync(file.path)], { type: file.type }), `${randomUUID()}${path.extname(file.name)}`);
        form.append("overwrite", "true");
        const res = await expectOk(await conn.fetch("/upload/image", { method: "POST", body: form }), "Upload to ComfyUI");
        const { name, subfolder } = (await res.json()) as { name: string; subfolder?: string };
        const ref = subfolder ? `${subfolder}/${name}` : name;
        values[`file:${key}:${i}`] = ref;
        if (i === 0) values[`file:${key}`] = ref;
      }
    }
    const graph = fillWorkflow(loadWorkflow(opts.workflow), values);
    const res = await conn.fetch("/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: "dernity" }),
    });
    const body = (await res.json().catch(() => ({}))) as { prompt_id?: string; error?: { message?: string }; node_errors?: unknown };
    if (!res.ok || !body.prompt_id) {
      throw new Error(`ComfyUI rejected the workflow: ${body.error?.message ?? res.status} ${body.node_errors ? JSON.stringify(body.node_errors).slice(0, 400) : ""}`);
    }
    return body.prompt_id;
  },

  async poll(conn, _model, id) {
    const entry = await history(conn, id);
    if (entry) {
      if (entry.status?.status_str === "error") {
        const msg = entry.status.messages?.find(([type]) => type === "execution_error")?.[1]?.exception_message;
        return { status: "failed", error: msg?.trim() || "ComfyUI execution error" };
      }
      if (entry.status?.completed || entry.status?.status_str === "success") return { status: "completed" };
    }
    const res = await expectOk(await conn.fetch("/queue", { signal: AbortSignal.timeout(20000) }), "GET /queue");
    const queue = (await res.json()) as { queue_running?: unknown[][]; queue_pending?: unknown[][] };
    if (queue.queue_running?.some((item) => item[1] === id)) return { status: "running" };
    return { status: "queued" };
  },

  async outputs(conn, _model, id) {
    const entry = await history(conn, id);
    if (!entry) throw new Error("ComfyUI forgot this job (server restarted?)");
    const files: OutputFile[] = [];
    for (const ref of outputRefs(entry)) {
      const qs = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder, type: ref.type });
      const res = await expectOk(await conn.fetch(`/view?${qs}`), "Download output");
      files.push({ name: ref.filename, data: new Uint8Array(await res.arrayBuffer()) });
    }
    if (!files.length) throw new Error("ComfyUI finished without output files");
    return files;
  },
};

export default comfyui;
