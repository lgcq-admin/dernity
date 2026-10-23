---
name: deploy-model
description: Deploy a model (usually from Hugging Face) on a rented GPU on Vast.ai or RunPod and connect it to Dernity. Use when the user asks to deploy, run, host or spin up a model.
---

# Deploy a model

Goal: the model runs on a rented GPU, is reachable, has a config in `models/`, and shows as ready in Dernity.
Read `NOTES.md` first for the user's budget, preferred providers, regions and SSH key.

## 1. Understand the model

- Check `bestiary/` first: if there's a guide for this model or a close relative, use its limits, settings,
  hardware rows and gotchas instead of rediscovering them.
- Find the exact repository: `node scripts/hf-model.mjs <owner/repo>`. It prints the task, license, gated
  status, weight size, GGUF files and a VRAM estimate. If the user gave a loose name, search Hugging Face
  and confirm the repo with the user when there's more than one plausible match.
- Read the model card and look for: how to run it (official instructions beat guesses), the recommended
  server, chat template quirks, recommended sampling params, resolution / frame count / fps for video,
  which inputs it accepts (reference images, first/last frame), and prompt guidance. Search the web for
  "<model> vLLM", "<model> llama.cpp", "<model> ComfyUI workflow" when the card is thin.
- Gated repos need the user's `HF_TOKEN` on the machine; ask the user to accept the license on the model page.

## 2. Pick the runtime

| Model | Runtime | Port | Protocol in config |
| --- | --- | --- | --- |
| GGUF text model, or VRAM is tight | llama.cpp server (`ghcr.io/ggml-org/llama.cpp:server-cuda`) | 8080 | `openai-chat` |
| safetensors text model, enough VRAM | vLLM (`vllm/vllm-openai`) or SGLang | 8000 / 30000 | `openai-chat` |
| image or video diffusion | ComfyUI with a workflow for that model | 8188 | `comfyui` |

Check the image's current tags and flags on its docs page before using them. For ComfyUI, prefer the
provider's official ComfyUI template and download the model files the workflow needs (see the
model-capabilities skill for workflow placeholders).

## 3. Estimate what's needed

- VRAM: weights + ~20% (more for long context or video). For GGUF, pick the largest quant that fits.
- Disk: weights × 1.5 + 20 GB for the image and caches.
- Download speed matters: 50 GB over 200 Mbps takes ~35 minutes of paid time. Prefer ≥ 500 Mbps.

## 4. Offer machines and let the user choose

```bash
node scripts/gpu-offers.mjs --vram <GB> [--gpus 1] [--max-price <$/h>]
```

Show the user 3–6 options as a short table: provider, GPU, VRAM, $/h, reliability, network, location, and
one line on the trade-off (cheapest, most reliable, fastest download, secure cloud). Skip mining cards
(CMP series) and GPUs too old for the runtime. Recommend one. **Wait for the user's choice. Don't rent
anything without it.**

## 5. Create the machine

Use the model id as the label/name so the config can find it by name.

**Don't leave the model server open to the internet.** Model servers have no login by default, and anyone
who finds the port can use (and run up) the GPU. Pick one:

- Vast.ai: don't publish the server port (no `-p` for it). The app reaches it through an SSH tunnel
  (`"tunnel": true` and the user's `sshKey` in the config). The user's SSH key must be added to their
  Vast account; check `NOTES.md` or ask.
- RunPod (its HTTPS proxy is public): generate a token into `secrets/<id>.token`, start the server with
  it as `--api-key`, and set `"apiKeyFile": "<id>.token"` in the config. Don't print the token. For
  ComfyUI, which has no API key, expose only `22/tcp` and use `"tunnel": true` with `sshKey`.

Vast.ai, SSH launch mode (keeps SSH for the tunnel; the image entrypoint doesn't run, so start the server
from `--onstart-cmd`, e.g. `/app/llama-server ... --host 127.0.0.1 --port 8080` for the llama.cpp image;
check the binary path in the image docs):

```bash
vastai create instance <offer_id> --image <image:tag> --disk <GB> --label <id> \
  --ssh --direct --env '-e HF_TOKEN=$HF_TOKEN' --onstart-cmd '<command that starts the server>'
```

RunPod:

```bash
runpodctl pod create --name <id> --gpu-id "<gpu id from the table>" --image <image:tag> \
  --container-disk-in-gb <GB> --ports '8000/http,22/tcp' --cloud-type COMMUNITY|SECURE \
  --docker-args "<server args> --api-key $(cat secrets/<id>.token)" --env '{"HF_TOKEN":"..."}'
```

Never echo tokens in your messages. Follow progress with `vastai show instance <id>` / `vastai logs <id>`
or `runpodctl pod get <id>` until the server reports it's listening.

## 6. Record it

Append one line to `deployments.jsonl` right after the machine is created (schema in
`.dernity/deployment.schema.json`; never include tokens):

```json
{"id":"qwen3-8b-20261022-1910","at":"2026-10-22T19:10:00Z","model":"Qwen/Qwen3-8B-GGUF","file":"Q4_K_M","runtime":"llama.cpp","image":"ghcr.io/ggml-org/llama.cpp:server-cuda","args":"-hf Qwen/Qwen3-8B-GGUF:Q4_K_M -ngl 99 -c 16384 --jinja","provider":"vast","machine":"qwen3-8b","machineId":"12345678","gpu":"RTX A4000","pricePerHour":0.121,"region":"Germany, DE","configId":"qwen3-8b","notes":"test model, 16k context"}
```

## 7. Connect it

Write `models/<id>.json` (see the connect-model skill and `examples/`), with the inputs, params and notes you
learned in step 1. Then check `.dernity/models-status.json` until the model is valid and healthy, and run
the server checks and the one light smoke test from the model-capabilities skill (steps 2 and 3).

## 8. Write the guide

Create or update `bestiary/<id>.json` (bestiary skill) with what you learned: limits, recommended
settings, example prompts, the GPU it ran on with $/h, and anything that went wrong.

## 9. Report

Tell the user: what runs where, $/h, what the model supports in the app, and how to stop it
(`vastai stop instance <id>` / `runpodctl pod stop <id>`) so they don't pay for idle time.
