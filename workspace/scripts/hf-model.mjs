#!/usr/bin/env node
// Facts about a Hugging Face model for deploying it: task, tags, license, gated, weight files and sizes,
// and a rough VRAM estimate. Uses HF_TOKEN or the huggingface-cli token for gated repos.
//   node scripts/hf-model.mjs <owner/repo> [--json]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = process.argv[2];
if (!repo || repo.startsWith("--")) {
  console.error("usage: hf-model.mjs <owner/repo> [--json]");
  process.exit(1);
}

function token() {
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN;
  try {
    return fs.readFileSync(path.join(os.homedir(), ".cache", "huggingface", "token"), "utf8").trim();
  } catch {
    return undefined;
  }
}

const t = token();
const res = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
if (!res.ok) {
  console.error(`Hugging Face: HTTP ${res.status} for ${repo}${res.status === 401 ? " (gated or private: set HF_TOKEN)" : ""}`);
  process.exit(1);
}
const m = await res.json();

const files = (m.siblings ?? []).map((s) => ({ name: s.rfilename, size: s.size ?? 0 }));
const gb = (n) => Math.round((n / 1e9) * 10) / 10;
const weights = files.filter((f) => /\.(safetensors|bin|pt|pth|ckpt)$/.test(f.name) && !/^(original|consolidated)\//.test(f.name));
const ggufs = files.filter((f) => f.name.endsWith(".gguf"));
const weightsGb = gb(weights.reduce((s, f) => s + f.size, 0));

const info = {
  id: m.id,
  task: m.pipeline_tag ?? null,
  library: m.library_name ?? null,
  license: m.cardData?.license ?? null,
  gated: m.gated ?? false,
  tags: (m.tags ?? []).filter((x) => !/^(arxiv|region|deploy|endpoints_compatible)/.test(x)),
  baseModels: [].concat(m.cardData?.base_model ?? []),
  weightsGb,
  // Weights + ~20% for activations / KV cache at moderate context. A starting point, not a guarantee.
  vramEstimateGb: weightsGb ? Math.ceil(weightsGb * 1.2) : null,
  gguf: ggufs.map((f) => ({ file: f.name, gb: gb(f.size), vramEstimateGb: Math.ceil(gb(f.size) * 1.2 + 1) })),
  hasComfyWorkflows: files.some((f) => /workflow.*\.json$/i.test(f.name)),
  files: files.length,
};

if (process.argv.includes("--json")) console.log(JSON.stringify(info, null, 2));
else {
  for (const [k, v] of Object.entries(info)) {
    if (k === "gguf") {
      if (v.length) {
        console.log("gguf:");
        for (const g of v) console.log(`  ${g.file}  ${g.gb} GB  (~${g.vramEstimateGb} GB VRAM)`);
      }
    } else console.log(`${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  }
  console.log(`card: https://huggingface.co/${m.id}`);
}
