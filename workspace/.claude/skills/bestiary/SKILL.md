---
name: bestiary
description: Write or update the Bestiary guide for a model (workspace/bestiary/<id>.json): what it does, limits, recommended settings, example prompts, which GPUs it ran on, gotchas, sources. The app shows it as interactive cards. Use after deploying, connecting or studying a model, and read it before deploying a model again.
---

# Bestiary guides

The Bestiary is the user's field guide to the models they run, and your memory between deploys. Each guide
is one JSON file, `bestiary/<id>.json`, validated against `.dernity/bestiary.schema.json`. The app shows it
as cards: limits as tiles, examples with a "Try" button that fills the Studio form, recommended settings
the user can apply in one click, a hardware table. Write for that: short, concrete, structured.

## When

- After a deploy or connect: create the guide, or update it if one exists for the model.
- Before deploying a model: read its guide (and similar ones) and use what worked, avoid what didn't.
- When the user asks what a model can do or how to prompt it.

## What goes in

Example: `examples/bestiary/wan22-i2v.json`.

| Field | What to write |
| --- | --- |
| `id`, `name`, `kind` | One guide per model family/variant; `id` like the config id without the machine part |
| `summary` | 1–2 sentences: what it is, what it's good at |
| `repo` | Hugging Face `owner/name` |
| `models` | Ids of configs in `models/` that use this model, so the Studio shows the guide next to the form |
| `tasks` | Short tags: `text-to-image`, `image-to-video`, `first/last frame`, `vision` |
| `limits` | Hard limits as label + short value: max frames, fps, resolution rule, context length |
| `settings` | Recommended values. Set `key` to the param key in the config so the user can apply it; `why` in one line |
| `prompting.tips` / `avoid` | One line each, from the model card or official prompt guide |
| `prompting.examples` | 2–4 prompts that show off the model, each with a short `title`; `params` only with keys the config has |
| `hardware` | Only what you actually ran: GPU, VRAM, `fits`, rough `speed`, $/h. Add a row when something didn't fit too |
| `gotchas` | What broke and how you fixed it, one line each |
| `sources` | Model card, official repo, prompt guide: label + https URL |
| `updatedAt` | Today's date |

## Rules

- Facts come from the model card, the official repo and your own runs. Mark community knowledge as such
  in the text ("community reports…"). Don't invent speeds or VRAM numbers.
- Plain text only, no Markdown. Keep every line short; the cards are small.
- Never put secrets, tokens, IPs, or anything from `../library` or `../chats` into a guide.
- Update in place: merge new hardware rows and gotchas, don't drop old ones that are still true.
- After writing, read `.dernity/bestiary-status.json` and fix any validation error.
