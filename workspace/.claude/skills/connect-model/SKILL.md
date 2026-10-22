---
name: connect-model
description: Connect a model server that's already running (on Vast.ai, RunPod, an SSH box or a URL) to Dernity by writing its model config. Use when the user asks to add, connect or hook up a model or machine.
---

# Connect a running model

1. **Find the machine.** `vastai show instances` / `runpodctl pod list`, or ask for the URL / SSH address.
   Note its label or pod name: configs should reference machines by name, not id.
2. **Find the server and port.** SSH in (`vastai ssh-url <id>`, `runpodctl ssh info <id>`) and check what
   listens: `ss -ltnp`. Typical: llama.cpp 8080, vLLM 8000, SGLang 30000, ComfyUI 8188.
3. **Identify the API.**
   - `curl -s localhost:<port>/v1/models` answers → `openai-chat`. Use the listed model id as `model` if
     the server hosts several.
   - `curl -s localhost:<port>/system_stats` answers → `comfyui`. You also need a workflow: export it from
     the ComfyUI UI with "Export (API)", or take it from the model's repo, put placeholders in, and save to
     `workflows/<id>.json` (see the model-capabilities skill).
   - Anything else isn't supported yet; tell the user.
4. **Decide how the app reaches it.**
   - RunPod: the port must be exposed as HTTP in the pod (`--ports 8000/http`); the app uses
     `https://<pod>-<port>.proxy.runpod.net`.
   - Vast: if the port is mapped publicly, the app uses it; otherwise it opens an SSH tunnel. Set `sshKey`
     if the user's key isn't the ssh default (check `NOTES.md`).
   - SSH box: always tunnelled.
5. **Check exposure.** If the server port is reachable from the internet without a token, tell the user
   (see Exposure in `AGENTS.md`) before connecting it.
6. **Describe what it can do.** Follow the model-capabilities skill to fill `inputs`, `params` and `notes`.
7. **Write `models/<id>.json`** and wait for `.dernity/models-status.json` to show it valid and healthy.
   Fix and retry if not.

Minimal configs are in `examples/`.
