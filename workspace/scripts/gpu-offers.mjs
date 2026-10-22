#!/usr/bin/env node
// Compares GPU offers on Vast.ai and RunPod for a model that needs a given amount of VRAM.
//   node scripts/gpu-offers.mjs --vram 48 [--gpus 1] [--max-price 2] [--limit 15] [--json]
// Vast offers come from the `vastai` CLI; RunPod prices from its GraphQL API (RUNPOD_API_KEY or runpodctl config).
// Read-only: it never rents anything.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]]] : acc), []),
);
const vram = Number(args.vram);
if (!vram) {
  console.error("usage: gpu-offers.mjs --vram <GB total> [--gpus 1] [--max-price <$/h>] [--limit 15] [--json]");
  process.exit(1);
}
const gpus = Number(args.gpus ?? 1);
const maxPrice = args["max-price"] ? Number(args["max-price"]) : Infinity;
const limit = Number(args.limit ?? 15);

function vastOffers() {
  const query = `gpu_total_ram>=${vram} num_gpus=${gpus} reliability>0.97 verified=true rentable=true inet_down>=200`;
  try {
    const raw = execFileSync("vastai", ["search", "offers", query, "-o", "dph+", "--limit", "40", "--raw"], { encoding: "utf8", timeout: 60000 });
    return JSON.parse(raw).map((o) => ({
      provider: "vast",
      offer: String(o.id),
      gpu: o.gpu_name,
      gpus: o.num_gpus,
      vramGb: Math.round(o.gpu_total_ram / 1024),
      price: o.dph_total,
      reliability: o.reliability2 ?? o.reliability,
      netDownMbps: Math.round(o.inet_down),
      location: o.geolocation ?? "",
      cloud: o.hosting_type === 1 ? "datacenter" : "community",
    }));
  } catch (err) {
    console.error(`vast: ${err.code === "ENOENT" ? "vastai CLI not installed (pip install vastai)" : err.message.split("\n")[0]}`);
    return [];
  }
}

function runpodKey() {
  if (process.env.RUNPOD_API_KEY) return process.env.RUNPOD_API_KEY;
  try {
    return fs.readFileSync(path.join(os.homedir(), ".runpod", "config.toml"), "utf8").match(/^\s*apikey\s*=\s*["']([^"']+)["']/im)?.[1];
  } catch {
    return undefined;
  }
}

async function runpodOffers() {
  const key = runpodKey();
  if (!key) {
    console.error("runpod: no API key (RUNPOD_API_KEY or `runpodctl config --apiKey`)");
    return [];
  }
  const query = `{ gpuTypes { id displayName memoryInGb secureCloud communityCloud securePrice communityPrice lowestPrice(input:{gpuCount:${gpus}}) { stockStatus } } }`;
  const res = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  const types = body.data?.gpuTypes;
  if (!types) {
    console.error(`runpod: ${body.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
    return [];
  }
  return types
    .filter((t) => t.memoryInGb * gpus >= vram && t.lowestPrice?.stockStatus)
    .flatMap((t) =>
      [
        t.communityCloud && t.communityPrice ? { cloud: "community", price: t.communityPrice } : null,
        t.secureCloud && t.securePrice ? { cloud: "secure", price: t.securePrice } : null,
      ]
        .filter(Boolean)
        .map((c) => ({
          provider: "runpod",
          offer: t.id,
          gpu: t.displayName,
          gpus,
          vramGb: t.memoryInGb * gpus,
          price: c.price * gpus,
          reliability: null, // RunPod publishes no per-host reliability; secure cloud = vetted datacenters
          netDownMbps: null,
          location: `stock: ${t.lowestPrice.stockStatus}`,
          cloud: c.cloud,
        })),
    );
}

const offers = [...vastOffers(), ...(await runpodOffers())]
  .filter((o) => o.price <= maxPrice)
  .sort((a, b) => a.price - b.price)
  .slice(0, limit);

if (args.json) {
  console.log(JSON.stringify(offers, null, 2));
} else {
  const rows = offers.map((o) => [
    o.provider,
    o.cloud,
    `${o.gpus}x ${o.gpu}`,
    `${o.vramGb} GB`,
    `$${o.price.toFixed(3)}/h`,
    o.reliability == null ? "-" : `${(o.reliability * 100).toFixed(1)}%`,
    o.netDownMbps == null ? "-" : `${o.netDownMbps} Mbps`,
    o.location,
    o.offer,
  ]);
  const head = ["provider", "cloud", "gpu", "vram", "price", "reliab.", "net down", "location", "offer / gpu id"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  for (const r of [head, ...rows]) console.log(r.map((c, i) => String(c).padEnd(widths[i])).join("  "));
}
