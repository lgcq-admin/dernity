---
name: redeploy
description: Run again a model the user deployed before, using the deployment history. Use when the user asks to bring back, re-run, redeploy or "start again" a model or machine they had earlier.
---

# Redeploy from history

History lives in two files:

- `deployments.jsonl`: what you (or another agent) deployed: Hugging Face repo, quant, runtime, image,
  server args, machine label, GPU, price, region, config id, notes.
- `.dernity/machines.json`: what the app saw from the provider APIs: every machine with GPU, region,
  image, run times and $/h, including deleted ones.

## Steps

1. **Find the entry.** Match the user's words (model name, date, "the one from yesterday", GPU) against
   `deployments.jsonl` first, then `.dernity/machines.json`. If several match, list them briefly (date,
   model, GPU, $/h) and ask which one. If the user names a deployment id, use it.
2. **Show it back.** One short summary: model and quant, runtime, GPU it ran on, what it cost per hour,
   and how long it ran if `machines.json` knows.
3. **Check what changed.** Is the machine still there, just stopped? Then offer to start it instead of
   renting a new one (`vastai start instance <id>` / `runpodctl pod start <id>`); it's usually faster and
   keeps downloaded weights. Otherwise look for a new machine.
4. **Offer machines.** `node scripts/gpu-offers.mjs --vram <same GPU's VRAM>` and show the same GPU first,
   then cheaper or more reliable alternatives. Mention if today's price differs from last time.
   **Wait for the user's choice.**
5. **Deploy with the same recipe**: same image, args and runtime, following the Exposure and Secrets rules
   in `AGENTS.md` even if the old deployment didn't (create a new token; don't reuse a published port).
6. **Record and connect.** Append a new line to `deployments.jsonl` (new id, `"notes": "redeploy of <old id>"`),
   then write or update `models/<configId>.json` and check `.dernity/models-status.json`.
7. **Report** cost per hour and how to stop it.
