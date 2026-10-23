---
name: model-capabilities
description: Work out what a model supports (reference images, first/last frame, vision input, resolution, duration and frame limits, sampling params, prompt style), check it on the running server with one light smoke test, and express it in its Dernity config so the UI shows exactly those inputs with working ranges. Use when adding a model or when the user asks what a model can do or wants an input added.
---

# Describe a model's capabilities

The app shows only what the config declares. Missing input = the user can't use a feature; an input the
model ignores = confusing; a range the model can't handle = a failed generation the user paid for. Get it
right from sources and from the running server, not guesses.

## 1. Find out from sources

1. Model card and official repo: supported tasks (t2i, i2i, t2v, i2v, flf2v, ref2v…), inputs, recommended
   and supported resolutions, frame counts, fps, steps, CFG, sampler, prompt format, negative prompt support.
2. For video, write down the hard limits before anything else:
   - the frame rule (LTX-Video: 8n+1, Wan 2.x and HunyuanVideo: 4n+1) → `options.frameStep`;
   - native fps (Wan 2.1 and Wan 2.2 A14B: 16, Wan 2.2 TI2V-5B: 24, LTX: 24 or 25) → `options.fps`;
   - minimum and maximum frames it was trained for (e.g. Wan 14B: 81 frames ≈ 5 s at 16 fps); check the
     card for the exact version, since limits change between releases. Longer clips loop, freeze or fall apart;
   - resolution divisibility (LTX: 32, Wan: 16) → `options.sizeStep`, and the resolutions it was trained at.
3. For ComfyUI: the workflow is the truth. Look at its loader nodes (`LoadImage`, `LoadVideo`, …) and the
   inputs of the model's conditioning nodes (start/end image, reference images).
4. For chat models: vision support (`image-text-to-text` task, `mmproj` file for llama.cpp, a vision
   processor in the repo), reasoning output, context length, recommended temperature / top_p / max tokens.
5. Search the web when the card is thin: "<model> prompt guide", "<model> comfyui workflow", community
   posts. Prefer official sources and note what's community knowledge.

## 2. Ask the running server

Sources say what the model can do; the server says what this deployment accepts. Run these on the machine
(`ssh` in, `curl localhost:<port>`), not through a public URL.

- ComfyUI: `curl -s localhost:8188/object_info/<NodeClass>` for every node that gets a placeholder. Each
  input lists its type, `min`, `max`, `step` and, for combos, the allowed values. Use them:
  - frame/length inputs (`EmptyLTXVLatentVideo.length`, `WanImageToVideo.length`…) bound `seconds`;
  - width/height inputs give the max size and step;
  - combo inputs (`sampler_name`, `scheduler`, `lora_name`, `ckpt_name`) give the only valid select
    options; never offer a value that isn't in that list.
- vLLM / SGLang: `/v1/models` shows `max_model_len`; llama.cpp: `/props` shows `n_ctx`. Cap `max_tokens`
  below the context length.
- `nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv` to know the headroom you have.

## 3. One quick smoke test

Generations can take many minutes, and the user is waiting and paying. Never run long or large test jobs.
Run exactly one, the lightest the config allows, only to prove the pipeline works end to end:

- Image: smallest size offered, the minimum steps, one image.
- Video: shortest duration, smallest size, the minimum steps.
- Chat: one short request (`max_tokens` around 16), plus one with a small image if vision is declared.
- Check it finished (`/history/<prompt_id>` for ComfyUI) and the output exists. For video, `ffprobe` on the
  machine confirms the frame count and fps match what the config computes.
- If even this takes more than a couple of minutes or fails, stop and tell the user what you saw instead
  of trying more variants.

Upper limits (longest duration, largest size) come from the sources and `/object_info`, not from test runs.
Tell the user what you ran and how long it took; put the time in `notes` as a rough guide.

## 4. Write it into the config

- `prompt`: `"required"` (default) when the model needs text; `"optional"` when it also works from input
  files alone (many i2v and edit models). The app marks required fields with an asterisk.
- `inputs`: one entry per file the model takes. Keys: `refs`, `first_frame`, `last_frame`, `images` (chat
  vision), `video`, `audio`. Set `max` and `required` honestly.
- `params`: only the ones worth touching, with sensible defaults and the ranges you verified. Set
  `"required": true` on a param the model can't run without and that has no sensible default. For
  openai-chat the key is the API field (`temperature`, `top_p`, `max_tokens`, `presence_penalty`…). For
  ComfyUI, standard keys get derived values: `aspect` + `shortEdge` → `{{width}}` `{{height}}`; `seconds`
  (+ `fps`) → `{{frames}}`; `seed: null` → random. Any other key is available as `{{<key>}}`.
- `notes`: 1–3 lines of prompting advice from the sources (structure, what works, what to avoid).

### How params look in the app

The app picks the control from what you declare, so declare enough for it to choose well:

| Declared | Shown as |
| --- | --- |
| `number` with `min` and `max` | slider with a typed value; always give both when the model has limits |
| `number` without both | a text field for numbers (seed, max tokens) |
| `select` with 2–5 short options | buttons in a row |
| `select` with more or longer options | a dropdown |
| `text`, `textarea` | full-width text |

- Always set `step` on numbers (`1` for integers like steps and seconds, `0.05` for CFG or temperature).
- Option labels are shown in a narrow panel. When a value is long (file names, sampler ids, LoRA paths),
  give it a short label: `{ "value": "loras/realism_v2_rank64.safetensors", "label": "Realism v2" }`.
  Keep labels under ~20 characters; put the detail in `hint`.
- `seconds` as a `number` with `min`, `max`, `step: 1` is easier to use than a long `select`. Use a select
  only when only specific durations work.
- Order params by how often the user changes them: duration and size first, seed and negative prompt last.

## ComfyUI workflow placeholders

Workflows are API-format JSON in `workflows/`. Replace literal values with placeholders:

| Placeholder | Value |
| --- | --- |
| `{{prompt}}` | the prompt box |
| `{{seed}}` | seed param, random if empty |
| `{{width}}` `{{height}}` | from `aspect` + `shortEdge` params (or `width`/`height` params), rounded to `sizeStep` |
| `{{frames}}` `{{fps}}` | from `seconds` (+ `fps`) params; frames = n × frameStep + 1 |
| `{{file:<key>}}` | uploaded name of the first file of input `<key>` (`{{file:<key>:1}}` for the second) |
| `{{<param key>}}` | any other param |

A string that is exactly one placeholder takes the value's type, so `"steps": "{{steps}}"` becomes a
number. Every placeholder in the workflow must get a value, so an optional file input needs a workflow
variant without that loader (make two configs, e.g. `wan-i2v` and `wan-flf2v`).

Check the frame math against the model: with `fps` 16 and `frameStep` 4, 5 s gives 81 frames; with `fps`
24 and `frameStep` 8, 5 s gives 121. The largest `seconds` must stay within the model's max frames.

After editing, check `.dernity/models-status.json` and ask the user to try a generation.
