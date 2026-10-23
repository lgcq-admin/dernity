import { z } from "zod";
import type { BestiaryFile } from "./bestiary";
import type { Deployment, MachineRecord } from "./history";
import type { ModelEntry, ModelHealth, ParamValues } from "./model";

// Files travel from the renderer as bytes: pasted images have no path, and the renderer has no fs.
export const IncomingFileSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  data: z.instanceof(Uint8Array),
});
export type IncomingFile = z.infer<typeof IncomingFileSchema>;

export type GenerationStatus = "queued" | "running" | "completed" | "failed";

// library/<date>/<id>/meta.json
export type Generation = {
  id: string;
  dir: string; // "<date>/<id>", relative to library/
  createdAt: number;
  finishedAt?: number;
  modelId: string;
  modelName: string;
  kind: "image" | "video";
  prompt: string;
  params: ParamValues; // as the user set them (null = auto)
  seed?: number; // the seed actually used when params.seed was auto
  inputs: Record<string, string[]>; // input key -> file names in refs/
  outputs: string[]; // file names in the generation dir
  status: GenerationStatus;
  progress?: number; // 0..1
  error?: string;
  remoteId?: string;
};

export const GenerationRequestSchema = z.object({
  modelId: z.string(),
  prompt: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  files: z.record(z.string(), z.array(IncomingFileSchema)),
});
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;

export type ChatAttachment = { file: string; name: string; type: string }; // file in chats/files/

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: ChatAttachment[];
  createdAt: number;
  error?: string;
};

// chats/<id>.json
export type Chat = {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  system?: string;
  messages: ChatMessage[];
};

export type ChatSummary = Pick<Chat, "id" | "title" | "modelId" | "updatedAt">;

export const ChatSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string(),
  modelId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  system: z.string().optional(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      reasoning: z.string().optional(),
      attachments: z.array(z.object({ file: z.string(), name: z.string(), type: z.string() })).optional(),
      createdAt: z.number(),
      error: z.string().optional(),
    }),
  ),
});

export const ChatStreamRequestSchema = z.object({
  requestId: z.string(),
  chatId: z.string(),
  modelId: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;

export type ChatDelta = {
  requestId: string;
  content?: string;
  reasoning?: string;
  done?: boolean;
  error?: string;
};

export type Provider = "runpod" | "vast";

export type Instance = {
  provider: Provider;
  id: string;
  name: string;
  status: "running" | "starting" | "stopped" | "exited" | "unknown";
  gpu: string;
  gpuCount: number;
  costPerHour: number;
  region?: string;
  image?: string;
  storagePerHour?: number; // what a stopped machine still costs (Vast disk)
  createdAt?: number;
};

export type ProviderState = {
  provider: Provider;
  keySource: KeySource;
  balance?: number;
  instances: Instance[];
  error?: string;
};

export type KeySource = "app" | "env" | "cli" | "none";

// Keys the app stores: provider API keys, and the Hugging Face token the agent terminals get as HF_TOKEN.
export type SecretName = Provider | "huggingface";

export type DetectedCli = { command: string; name: string; path: string };

export type AppInfo = {
  version: string;
  platform: string;
  home: string;
  workspace: string;
  library: string;
};

export interface DernityApi {
  app: {
    info(): Promise<AppInfo>;
    openPath(target: "workspace" | "library" | "home"): Promise<void>;
    showGeneration(id: string): Promise<void>;
  };
  models: {
    list(): Promise<ModelEntry[]>;
    health(id: string): Promise<ModelHealth>;
    healthAll(): Promise<Record<string, ModelHealth>>;
    onChanged(cb: (models: ModelEntry[]) => void): () => void;
    onHealth(cb: (id: string, health: ModelHealth) => void): () => void;
  };
  bestiary: {
    list(): Promise<BestiaryFile[]>;
    onChanged(cb: (files: BestiaryFile[]) => void): () => void;
  };
  chats: {
    list(): Promise<ChatSummary[]>;
    get(id: string): Promise<Chat | null>;
    save(chat: Chat): Promise<void>;
    remove(id: string): Promise<void>;
    attach(file: IncomingFile): Promise<{ file: string }>;
    stream(req: ChatStreamRequest): Promise<void>;
    abort(requestId: string): Promise<void>;
    onDelta(cb: (delta: ChatDelta) => void): () => void;
  };
  generations: {
    list(): Promise<Generation[]>;
    submit(req: GenerationRequest): Promise<Generation>;
    remove(id: string): Promise<void>;
    onUpdate(cb: (g: Generation) => void): () => void;
  };
  machines: {
    list(): Promise<ProviderState[]>;
    history(): Promise<{ machines: MachineRecord[]; deployments: Deployment[]; invalidDeployments: number }>;
  };
  secrets: {
    status(): Promise<Record<SecretName, KeySource>>;
    set(name: SecretName, key: string | null): Promise<void>;
  };
  terminals: {
    detect(): Promise<DetectedCli[]>;
    create(command?: string, prompt?: string): Promise<string>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): void;
    onData(cb: (id: string, data: string) => void): () => void;
    onExit(cb: (id: string, code: number) => void): () => void;
  };
}

// Custom protocol for showing local files (outputs, refs, chat attachments) in the renderer.
export const FILE_SCHEME = "dernity-file";
export const fileUrl = (area: "library" | "chats", relPath: string) =>
  `${FILE_SCHEME}://${area}/${relPath.split("/").map(encodeURIComponent).join("/")}`;
