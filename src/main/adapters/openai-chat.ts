// OpenAI-compatible chat completions: llama.cpp server, vLLM, SGLang, TGI, Ollama, LM Studio.
// Every non-empty param is sent as a request field, so param keys must be API field names
// (temperature, top_p, max_tokens, …). Reasoning models stream `reasoning_content` separately.
import type { ModelConfig } from "@shared/model";
import type { Conn } from "../hosts";
import { splitSse } from "./sse";
import { type ChatAdapter, type ChatTurn, expectOk } from "./types";

async function modelName(conn: Conn, model: ModelConfig): Promise<string> {
  if (model.model) return model.model;
  const res = await expectOk(await conn.fetch("/v1/models", { signal: AbortSignal.timeout(15000) }), "GET /v1/models");
  const body = (await res.json()) as { data?: { id: string }[] };
  const id = body.data?.[0]?.id;
  if (!id) throw new Error("Server lists no models");
  return id;
}

export function toOpenAiMessages(turns: ChatTurn[]) {
  return turns.map((t) =>
    t.images?.length
      ? {
          role: t.role,
          content: [
            ...t.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.type};base64,${img.base64}` } })),
            { type: "text", text: t.content },
          ],
        }
      : { role: t.role, content: t.content },
  );
}

// llama.cpp lists capabilities; flag a vision model whose config doesn't let the user attach images.
export function describeServer(body: unknown, model: ModelConfig): string | undefined {
  const b = body as { data?: { id: string }[]; models?: { capabilities?: string[] }[] };
  const id = model.model ?? b.data?.[0]?.id;
  const vision = b.models?.[0]?.capabilities?.includes("multimodal");
  const acceptsImages = model.inputs.some((i) => i.accept === "image");
  return vision && !acceptsImages ? `${id} · server accepts images, config has no image input` : id;
}

const openaiChat: ChatAdapter = {
  kind: "chat",

  async health(conn, model) {
    const res = await expectOk(await conn.fetch("/v1/models", { signal: AbortSignal.timeout(15000) }), "GET /v1/models");
    return describeServer(await res.json(), model);
  },

  async stream(conn, model, turns, params, signal, onDelta) {
    const fields = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== ""));
    const res = await conn.fetch("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, model: await modelName(conn, model), messages: toOpenAiMessages(turns), stream: true }),
      signal,
    });
    await expectOk(res, "Chat completion");
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const { events, rest } = splitSse(buffer + value);
      buffer = rest;
      for (const data of events) {
        if (data === "[DONE]") return;
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }[];
          error?: { message?: string };
        };
        if (chunk.error) throw new Error(chunk.error.message ?? "Server error");
        const delta = chunk.choices?.[0]?.delta;
        const reasoning = delta?.reasoning_content ?? delta?.reasoning;
        if (delta?.content || reasoning) onDelta({ content: delta?.content ?? undefined, reasoning: reasoning ?? undefined });
      }
    }
  },
};

export default openaiChat;
