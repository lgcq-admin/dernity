// Bestiary: one guide per model family, written by the user's agent into workspace/bestiary/<id>.json after
// it deploys or studies a model. Structured rather than prose so the app can show it as cards and act on it
// (apply recommended settings, try an example prompt). Written from web pages, so treated as untrusted:
// plain text only, links limited to http(s).
import { z } from "zod";

const text = (max: number) => z.string().min(1).max(max);
const value = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const link = z.object({
  label: text(80),
  url: z.url({ protocol: /^https?$/ }).describe("http(s) only"),
});

export const BestiaryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, . _ -"),
  name: text(80),
  kind: z.enum(["chat", "image", "video"]),
  summary: text(400).describe("One or two sentences: what the model is and what it's good at"),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional().describe("Hugging Face repo, owner/name"),
  models: z.array(z.string()).default([]).describe("Ids of model configs in models/ this guide is for"),
  tasks: z.array(text(40)).default([]).describe('What it can do, short tags: "text-to-video", "first/last frame"'),
  limits: z
    .array(z.object({ label: text(40), value: text(80), note: text(200).optional() }))
    .default([])
    .describe('Hard limits: "Max frames" → "121 (5 s at 24 fps)", "Resolution" → "multiples of 32"'),
  settings: z
    .array(z.object({ key: z.string().optional(), label: text(40), value, why: text(200).optional() }))
    .default([])
    .describe("Recommended settings; key = param key in the model config, so the app can apply it"),
  prompting: z
    .object({
      tips: z.array(text(300)).default([]),
      avoid: z.array(text(300)).default([]),
      examples: z
        .array(z.object({ title: text(60), prompt: text(2000), params: z.record(z.string(), value).optional() }))
        .default([]),
    })
    .default({ tips: [], avoid: [], examples: [] }),
  hardware: z
    .array(
      z.object({
        gpu: text(60),
        vramGb: z.number().positive().optional(),
        fits: z.boolean().describe("false when it didn't fit or ran out of memory"),
        speed: text(80).optional().describe('"~40 s per 5 s clip at 720p"'),
        pricePerHour: z.number().nonnegative().optional(),
        note: text(200).optional(),
      }),
    )
    .default([])
    .describe("What you actually ran it on, from your own deploys"),
  gotchas: z.array(text(300)).default([]).describe("Things that broke and how you fixed them"),
  sources: z.array(link).default([]),
  updatedAt: z.string().describe("ISO date"),
});

export type BestiaryEntry = z.infer<typeof BestiaryEntrySchema>;
export type BestiaryFile = { file: string; entry?: BestiaryEntry; error?: string };

export function parseBestiaryFile(file: string, text: string): BestiaryFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { file, error: `Invalid JSON: ${(err as Error).message}` };
  }
  const parsed = BestiaryEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return { file, error: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  }
  return { file, entry: parsed.data };
}

// The guide for a configured model: the one that lists it, else the one with the same id.
export function guideFor(entries: BestiaryEntry[], modelId: string): BestiaryEntry | undefined {
  return entries.find((e) => e.models.includes(modelId)) ?? entries.find((e) => e.id === modelId);
}
