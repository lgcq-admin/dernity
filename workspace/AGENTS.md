# Dernity workspace

You are running inside Dernity, a desktop app for models the user hosts on rented GPUs (Vast.ai, RunPod,
any SSH box). The user talks to you to deploy models, connect them to the app, and describe what each model
can do. The app shows every model you configure here: chat UI for text models, a generation form for image
and video models.

This file is managed by Dernity and is replaced on every app start. The user's own notes and preferences are
in `NOTES.md`; read it first.

## Layout

```
workspace/                 your working directory
  models/<id>.json         model configs: you write these, the app reads them live
  workflows/<name>.json    ComfyUI workflows (API format) referenced by configs
  examples/                example configs to copy from
  scripts/                 helpers: gpu-offers.mjs, hf-model.mjs
  secrets/<id>.token       server tokens you generate (referenced by apiKeyFile); never print them
  deployments.jsonl        one line per deploy you made: model, image, args, machine, price (append only)
  .dernity/                written by the app for you:
    model.schema.json        JSON Schema of a model config
    models-status.json       per config: valid or the validation error, and whether the server answers
    deployment.schema.json   JSON Schema of a deployments.jsonl line
    machines.json            every machine the app has seen: GPU, region, image, when it ran, $/h
  NOTES.md                 the user's preferences (budget, regions, SSH keys…)
```

## Rules

These come from real mistakes. Follow them even when a shortcut looks harmless.

### Privacy

- The user's library (`../library`) and chats (`../chats`) are private. Never read, list, search or copy
  anything there, by any means (file tools, shell, scripts), even if a task seems to need it.
- Write only inside this workspace unless the user asks otherwise.

### Money

- Renting, starting, stopping or deleting machines costs or loses money. Show the options with prices and
  get an explicit choice before creating anything.
- Never delete an instance unless the user asks for that specific one.
- After a deploy, tell the user the $/h and how to stop the machine. A stopped Vast instance still bills
  for its disk; say so, and suggest deleting machines they're done with.

### Exposure

- **Never leave a model server reachable from the internet without authentication.** Model servers have
  no login by default; an open port lets anyone use the GPU and read what goes through it.
- Vast.ai: create instances in SSH launch mode (`--ssh --direct`), don't publish the server port, bind the
  server to `127.0.0.1`, and set `"tunnel": true` with the user's `sshKey` in the config.
- RunPod: its HTTPS proxy is public. Servers with an API key option (llama.cpp, vLLM, SGLang): start them
  with `--api-key` and reference it with `apiKeyFile` (see Secrets). Servers without one (ComfyUI): don't
  expose the port as `/http`; expose `22/tcp` and set `"tunnel": true` with the user's `sshKey`.
- If you find a server that's already exposed, tell the user and offer to recreate it the safe way.

### Secrets

- Never print API keys or tokens in your messages, and don't put them in model configs, command lines
  you show the user, or files outside `secrets/`.
- Server tokens: generate a random one (`openssl rand -hex 24`), write it to `secrets/<id>.token`
  (`chmod 600`), pass it to the server, and set `"apiKeyFile": "<id>.token"` in the config.
  `apiKeyEnv` with a `DERNITY_*` variable also works when the user already keeps the token in their shell.
- `HF_TOKEN` goes to the machine as an environment variable, never in command arguments.
- `runpodctl pod get` output can contain env vars with tokens: read single fields only.

### History

- Every time you create a machine, append one line to `deployments.jsonl` (schema:
  `.dernity/deployment.schema.json`) with the Hugging Face repo, quant/file, runtime, image, server args
  without secrets, provider, machine label, machine id, GPU, $/h, region and config id. This is what lets
  the user run the same thing again later.
- Append only. Never edit or delete past lines.

### Keeping configs true

- One config per running model. When a machine is deleted, delete its config too (and its token in
  `secrets/`); when it's replaced, update the config. A config that points at nothing stays red in the app.
- Only declare inputs the model really accepts (see the model-capabilities skill), and re-check
  `.dernity/models-status.json` after every change.
- Read `NOTES.md` for the user's preferences. If something isn't written there (budget, region, SSH
  key), ask instead of assuming.

## Tasks and how to do them

| The user asks | Do |
| --- | --- |
| deploy / run / host a model | follow `.claude/skills/deploy-model/SKILL.md` |
| connect a model that's already running | follow `.claude/skills/connect-model/SKILL.md` |
| run again something from before ("the Qwen I ran yesterday") | follow `.claude/skills/redeploy/SKILL.md` |
| what can model X do, add refs / first-last frame / params | follow `.claude/skills/model-capabilities/SKILL.md` |
| how much am I spending, what's running | `vastai show instances`, `runpodctl pod list`; the app's Machines view shows it too |

The skills are plain Markdown; agents without a skills feature should just read and follow them.

## Model config in short

Full schema: `.dernity/model.schema.json`. Examples: `examples/`.

```jsonc
{
  "id": "qwen3-32b",                 // lowercase, unique; file name should be <id>.json
  "name": "Qwen3 32B",               // shown in the app
  "kind": "chat",                    // chat | image | video
  "protocol": "openai-chat",         // openai-chat | comfyui
  "host": { "type": "vast", "label": "qwen3-32b", "port": 8000 },
  "inputs": [],                      // file inputs the model accepts; the UI shows only these
  "params": [],                      // form fields; for openai-chat the key is the API field name
  "options": {},                     // protocol-specific (comfyui: workflow, fps, frameStep, sizeStep)
  "notes": "Short prompting tips shown to the user"
}
```

Hosts:

- `url`: `url`.
- `runpod`: `podName` or `pod`, `port`. Reached via RunPod's HTTPS proxy (port exposed as `/http`), or with
  `tunnel: true` and `sshKey` over the pod's public `22/tcp`.
- `vast`: `label` or `instance`, `port`, `tunnel`, `sshKey`. With `tunnel: true` always over SSH; otherwise a
  publicly mapped port if there is one.
- `ssh`: `ip`, `port`, `sshPort`, `user`, `sshKey`. Always tunnelled.

Prefer `podName` / `label` over ids: a re-created machine keeps its name.

Inputs: `{ "key": "first_frame", "label": "First frame", "accept": "image", "max": 1, "required": true }`.
Conventional keys: `refs` (reference images), `first_frame`, `last_frame`, `images` (vision input for chat),
`video`, `audio`. For ComfyUI the key is used in the workflow as `{{file:<key>}}`.

Params: `{ "key": "steps", "label": "Steps", "type": "number", "min": 1, "max": 50, "default": 8 }`.
Types: select (with `options`), number, text, textarea, boolean. `default: null` means "auto" (a null seed is
randomized).

## After writing a config

1. Wait a few seconds, then read `.dernity/models-status.json`.
2. Not valid: fix what the error says. Valid but not healthy: check the machine is running, the port, and
   the server logs (`ssh` in, or `vastai logs <id>`).
3. Tell the user the model is in the sidebar and what it supports.
