---
name: model-capabilities
description: Work out what a model supports (reference images, first/last frame, vision input, resolution, duration, sampling params, prompt style) and express it in its Dernity config so the UI shows exactly those inputs. Use when adding a model or when the user asks what a model can do or wants an input added.
---

# Describe a model's capabilities

The app shows only what the config declares. Missing input = the user can't use a feature; an input the
model ignores = confusing. Get it right from sources, not guesses.

## Find out

1. Model card and official repo: supported tasks (t2i, i2i, t2v, i2v, flf2v, ref2v…), inputs, recommended
   resolutions, frame counts, fps, steps, CFG, sampler, prompt format, negative prompt support.
2. For ComfyUI: the workflow is the truth. Look at its loader nodes (`LoadImage`, `LoadVideo`, …) and the
   inputs of the model's conditioning nodes (start/end image, reference images).
3. For chat models: vision support (`image-text-to-text` task, `mmproj` file for llama.cpp, a vision
   processor in the repo), reasoning output, recommended temperature / top_p / max tokens.
4. Search the web when the card is thin: "<model> prompt guide", "<model> comfyui workflow", community
   posts. Prefer official sources and note what's community knowledge.

## Write it into the config

- `inputs`: one entry per file the model takes. Keys: `refs`, `first_frame`, `last_frame`, `images` (chat
  vision), `video`, `audio`. Set `max` and `required` honestly.
- `params`: only the ones worth touching, with sensible defaults and ranges. For openai-chat the key is the
  API field (`temperature`, `top_p`, `max_tokens`, `presence_penalty`…). For ComfyUI, standard keys get
  derived values: `aspect` + `shortEdge` → `{{width}}` `{{height}}`; `seconds` (+ `fps`) → `{{frames}}`;
  `seed: null` → random. Any other key is available as `{{<key>}}`.
- `notes`: 1–3 lines of prompting advice from the sources (structure, what works, what to avoid).

## ComfyUI workflow placeholders

Workflows are API-format JSON in `workflows/`. Replace literal values with placeholders:

| Placeholder | Value |
| --- | --- |
| `{{prompt}}` | the prompt box |
| `{{seed}}` | seed param, random if empty |
| `{{width}}` `{{height}}` | from `aspect` + `shortEdge` params (or `width`/`height` params) |
| `{{frames}}` `{{fps}}` | from `seconds` (+ `fps`) params; frames = n × frameStep + 1 |
| `{{file:<key>}}` | uploaded name of the first file of input `<key>` (`{{file:<key>:1}}` for the second) |
| `{{<param key>}}` | any other param |

A string that is exactly one placeholder takes the value's type, so `"steps": "{{steps}}"` becomes a
number. Every placeholder in the workflow must get a value, so an optional file input needs a workflow
variant without that loader (make two configs, e.g. `wan-i2v` and `wan-flf2v`).

After editing, check `.dernity/models-status.json` and ask the user to try a generation.
