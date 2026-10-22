# Dernity: rules for agents developing this repo

These rules are for building Dernity itself. The instructions and skills Dernity ships to users' agents
(deploy, connect, detect capabilities) live in `workspace/`. Don't mix the two.

## What we're building

A desktop app for self-hosted models on rented GPUs: deploy via the user's own agent CLI in a built-in
terminal, use models through chat / image / video UI that adapts to each model's capabilities, see
balances and instances. Personal tool first, open source as-is. Read [README.md](README.md).

## Stack

- Electron, built with electron-vite and packaged with electron-builder (AppImage, dmg, exe; unsigned).
- TypeScript strict everywhere. npm.
- Renderer: React, Vite, Tailwind v4, shadcn/ui, AI Elements (chat UI), streamdown (markdown).
- Terminals: `node-pty` in main, `xterm.js` in renderer.
- Validation: zod schemas in `src/shared`, used on both sides of IPC and for every config file read.
- Tests: vitest.

## Architecture

```
src/
  main/       Node side: PTY sessions, CLI detection, file watching, model adapters, provider APIs,
              library storage, secrets. The only place with network, fs and child processes.
  preload/    typed IPC bridge (contextBridge). Thin: no logic.
  renderer/   React UI. No Node, no fs, no secrets, no direct calls to models or providers.
  shared/     types and zod schemas shared by main and renderer (model config, IPC contracts).
workspace/    template copied to ~/Dernity/workspace on every start: CLAUDE.md, AGENTS.md, skills, scripts and
              example configs for users' agents. NOTES.md is copied once and then belongs to the user.
```

- `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer. Every IPC channel has a zod
  schema for its input.
- **Model config is the contract.** The agent writes JSON configs; main validates them and the UI
  renders forms from declared capabilities. Never hardcode UI for a specific model. If a model needs
  something new, extend the schema and the generic renderer.
- **Adapters**: one file per protocol in `src/main/adapters/` (OpenAI-compatible chat, ComfyUI, …),
  all implementing one interface. Providers (Vast.ai, RunPod, SSH) are separate from adapters: a
  provider says how to reach a machine, an adapter says how to talk to the model on it.
- Long generations are owned by main, not the renderer. Reloading the window loses nothing.

## User data

```
~/Dernity/
  workspace/            agent cwd: instructions, skills, models/*.json
  library/<date>/<id>/  meta.json (prompt, params, model, seed, time) + refs/ + outputs
  chats/<id>.json, chats/files/
```

- Plain files only. No database, no cloud, no telemetry, no analytics.
- `library/` and `chats/` are private: outside the agent's workspace and denied in the workspace's
  agent settings. Never move them inside `workspace/` and never let the agent read them.
- Configs and metadata are human-readable JSON. A user must be able to back up by copying the folder.
- Secrets (provider API keys) go through Electron `safeStorage`. Never log them, never write them to
  config files, never send them to the renderer.

## Security

Configs in `workspace/` are written by an agent that reads web pages, so treat them like any other
untrusted input. Lessons from reviews so far:

- Anything from a config, the renderer or a provider API that reaches `spawn` arguments must be validated
  so it can't be read as an option (no leading `-`); pass `--` before positional arguments.
- Never let a config choose which local secret is sent where. Server tokens come only from
  `workspace/secrets/` (`apiKeyFile`, plain file names) or `DERNITY_*` environment variables.
- Paths from configs or IPC are resolved with `inside()` and rejected if they escape their folder.
- Agent instructions in `workspace/` must never lead to a model server open to the internet without
  authentication: tunnel it or require a token.
- Template files that agents read must not contain examples that look like real user preferences.

## Money

GPUs cost money per hour. The app never creates, starts or deletes an instance without an explicit user
action in the UI. Stopping can be offered, never done silently.

## Code

- Small modules with one job.
- No premature abstractions, no speculative options, no "framework" layers. Write what's needed now.
- Add a dependency only when it saves real work. Prefer what's already in the stack.
- UI: use shadcn/ui and AI Elements components first. They're copied into
  `src/renderer/components/{ui,ai-elements}` and are ours to edit. Write custom components only for
  what they don't cover (generation gallery, capability-driven forms, machines panel).
- Tailwind classes only. No CSS-in-JS, no separate CSS files except the theme.
- Comments explain why, not what. File headers say what the module is for when it isn't obvious.
- Errors: fail loudly in main with a clear message; show it in the UI. No silent catch-and-ignore.
- UI text in English. Code and comments in English.

## Tests

- Unit tests only, with vitest, for pure logic: schema validation, adapter request building and
  response parsing, capability-to-form mapping, library read/write, cost math, CLI detection.
- Don't write: e2e, Playwright, screenshot or visual tests, smoke tests, snapshot tests, tests for
  React components, tests that mock all of Electron.
- Don't add a regression test for every bug fix. Add one only when the logic is tricky enough to break
  again.
- Keep tests short. One behavior per test.

## Workflow

- `npm run dev` to run, `npm test` for unit tests, `npm run typecheck` and `npm run lint` before
  committing, `npm run dist` to package.
- Run with `DERNITY_HOME=/some/scratch/dir` to try things without touching your real `~/Dernity`.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- Verify UI changes by running the app, not by writing tests for them.
