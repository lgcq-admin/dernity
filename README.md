# Dernity

A desktop workspace for models you host yourself on rented GPUs (Vast.ai, RunPod, any SSH box).

- **Deploy** a model by asking your own coding agent (Claude Code, Codex, …) in the built-in terminal.
  Dernity ships the instructions and skills; the agent finds the model, compares GPU offers, and deploys
  after you pick one.
- **Use** it in one window: chat for text models, generation with previews for image and video models.
- **Adaptive UI**: the agent figures out what a model supports (reference images, first/last frame,
  duration, …) and writes a model config. The UI shows only the inputs that model accepts.
- **Machines at a glance**: balances, running and stopped instances, and $/h across providers.

## Principles

- **Local only.** Prompts, parameters and outputs stay on your machine as plain files. No cloud, no
  server database, no telemetry.
- **Your agent, your login.** Dernity runs the CLIs you already have installed and logged in. No API
  key for the agent.
- **Private from the agent.** Your library (prompts, outputs, references) sits outside the agent's
  workspace and is denied to it.

## How it works

```
Dernity (Electron)
├─ terminals       your installed CLIs (claude, codex, …), auto-detected, run in ~/Dernity/workspace
├─ models          JSON configs the agent writes; the app watches them and updates the UI
├─ chat / studio   talks to models over OpenAI-compatible APIs, ComfyUI, …
├─ machines        Vast.ai and RunPod APIs: balances, instances, cost
└─ library         ~/Dernity/library: every generation with its prompt, params and outputs
```

## Privacy note about rented GPUs

The owner of a rented machine can technically see what runs on it, including your prompts and outputs.
Dernity can't change that. For sensitive work, prefer datacenter hosts (RunPod Secure Cloud, verified
datacenters on Vast.ai) and delete instances when you're done.

## Development

See [AGENTS.md](AGENTS.md) for architecture and code rules.
