// Model config: the contract between the user's agent (writes workspace/models/*.json) and the UI
// (renders forms from it). Extend this schema instead of hardcoding UI for a specific model.
import { z } from "zod";

const port = z.number().int().min(1).max(65535);

// Values that end up as ssh arguments: nothing that could be read as an option.
const sshHost = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/, "hostname or IP address");
const sshUser = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_.-]*$/, "plain user name");
const sshKey = z.string().regex(/^[^-]/, "path to a private key").optional();

export const HostSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url"),
    url: z.url().describe("Base URL of the model server, without a trailing API path"),
  }),
  z.object({
    type: z.literal("runpod"),
    pod: z.string().optional().describe("Pod id"),
    podName: z.string().optional().describe("Pod name; preferred, survives re-creating the pod"),
    port: port.describe("Container port of the model server"),
    tunnel: z.boolean().optional().describe("Reach the port through SSH instead of RunPod's public HTTPS proxy"),
    sshKey: sshKey.describe("Private key path; default: ssh-agent / ~/.ssh defaults"),
  }),
  z.object({
    type: z.literal("vast"),
    instance: z.number().int().optional().describe("Instance id"),
    label: z.string().optional().describe("Instance label; preferred, survives re-creating the instance"),
    port: port.describe("Port inside the instance"),
    tunnel: z.boolean().optional().describe("Always reach the port through an SSH tunnel"),
    sshKey: sshKey.describe("Private key path; default: ssh-agent / ~/.ssh defaults"),
  }),
  z.object({
    type: z.literal("ssh"),
    ip: sshHost,
    port: port.describe("Port of the model server on the remote machine"),
    sshPort: port.default(22),
    user: sshUser.default("root"),
    sshKey,
  }),
]);

export const ParamSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string(),
  type: z.enum(["select", "number", "text", "textarea", "boolean"]),
  options: z
    .array(z.union([z.string(), z.number(), z.object({ value: z.union([z.string(), z.number()]), label: z.string().min(1) })]))
    .optional()
    .describe("Choices for type=select; use { value, label } when the value is long (file names, sampler ids)"),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  placeholder: z.string().optional(),
  suffix: z.string().optional(),
  hint: z.string().optional(),
  required: z.boolean().optional().describe("Generation can't run without a value; shown with an asterisk"),
}).refine((p) => p.type !== "select" || (p.options?.length ?? 0) > 0, { message: "type=select needs options", path: ["options"] });

export const FileInputSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).describe("e.g. refs, first_frame, last_frame, images"),
  label: z.string(),
  accept: z.enum(["image", "video", "audio", "any"]).default("image"),
  max: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
  hint: z.string().optional(),
});

export const ModelConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "lowercase letters, digits, . _ -"),
  name: z.string().min(1),
  kind: z.enum(["chat", "image", "video"]),
  protocol: z.enum(["openai-chat", "comfyui"]),
  host: HostSchema,
  model: z.string().optional().describe("Model name sent in API requests (openai-chat); default: first from /v1/models"),
  // Restricted to a dedicated prefix so a config can't send an unrelated secret (cloud keys, tokens) to its host.
  apiKeyEnv: z
    .string()
    .regex(/^DERNITY_[A-Z0-9_]+$/, "must start with DERNITY_, e.g. DERNITY_QWEN_TOKEN")
    .optional()
    .describe("Environment variable (DERNITY_*) with a Bearer token for the server"),
  apiKeyFile: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "a file name inside workspace/secrets/, no paths")
    .optional()
    .describe("File in workspace/secrets/ holding a Bearer token for the server"),
  prompt: z
    .enum(["required", "optional"])
    .default("required")
    .describe("Image/video: whether the model needs text. optional for models that work from input files alone"),
  inputs: z.array(FileInputSchema).default([]).describe("File inputs the model accepts; the UI shows only these"),
  params: z.array(ParamSchema).default([]).describe("Generation parameters shown as form fields"),
  options: z.record(z.string(), z.unknown()).default({}).describe("Protocol-specific settings"),
  notes: z.string().optional().describe("Short prompting tips shown next to the prompt box"),
}).refine((m) => !(m.apiKeyEnv && m.apiKeyFile), { message: "use apiKeyEnv or apiKeyFile, not both", path: ["apiKeyFile"] });

export type Host = z.infer<typeof HostSchema>;
export type Param = z.infer<typeof ParamSchema>;
export type FileInput = z.infer<typeof FileInputSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export type ModelEntry = {
  file: string;
  config?: ModelConfig;
  error?: string;
};

export type ModelHealth = { ok: boolean; detail?: string; checkedAt: number };

export type ParamValue = string | number | boolean | null;
export type ParamValues = Record<string, ParamValue>;

export function parseModelFile(file: string, text: string): ModelEntry {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { file, error: `Invalid JSON: ${(err as Error).message}` };
  }
  const parsed = ModelConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { file, error: issues.join("; ") };
  }
  return { file, config: parsed.data };
}

export function defaultParamValues(params: Param[]): ParamValues {
  return Object.fromEntries(params.map((p) => [p.key, p.default ?? null]));
}
