// Adapter = how to talk to one kind of model server. Providers (hosts.ts) say how to reach the machine;
// adapters say what to send once there. Add a protocol by adding a file and registering it in index.ts.
import type { ModelConfig, ParamValues } from "@shared/model";
import type { Conn } from "../hosts";

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: { type: string; base64: string }[];
};

export type JobFile = { name: string; type: string; path: string };

export type Job = {
  prompt: string;
  params: ParamValues;
  files: Record<string, JobFile[]>;
};

export type RemoteStatus = {
  status: "queued" | "running" | "completed" | "failed";
  progress?: number;
  error?: string;
};

export type OutputFile = { name: string; data: Uint8Array };

type Base = {
  // Returns a short description of what's running (model name, GPU); throws if the server doesn't answer.
  health(conn: Conn, model: ModelConfig): Promise<string | undefined>;
};

export type ChatAdapter = Base & {
  kind: "chat";
  stream(
    conn: Conn,
    model: ModelConfig,
    turns: ChatTurn[],
    params: ParamValues,
    signal: AbortSignal,
    onDelta: (d: { content?: string; reasoning?: string }) => void,
  ): Promise<void>;
};

export type GenerationAdapter = Base & {
  kind: "generation";
  submit(conn: Conn, model: ModelConfig, job: Job): Promise<string>;
  poll(conn: Conn, model: ModelConfig, remoteId: string): Promise<RemoteStatus>;
  outputs(conn: Conn, model: ModelConfig, remoteId: string): Promise<OutputFile[]>;
};

export type Adapter = ChatAdapter | GenerationAdapter;

export async function expectOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const text = (await res.text().catch(() => "")).slice(0, 500);
  throw new Error(`${what}: HTTP ${res.status}${text ? ` ${text}` : ""}`);
}
