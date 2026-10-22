import type { ModelConfig } from "@shared/model";
import comfyui from "./comfyui";
import openaiChat from "./openai-chat";
import type { Adapter, ChatAdapter, GenerationAdapter } from "./types";

const adapters: Record<ModelConfig["protocol"], Adapter> = {
  "openai-chat": openaiChat,
  comfyui,
};

export const adapterFor = (model: ModelConfig): Adapter => adapters[model.protocol];

export function chatAdapter(model: ModelConfig): ChatAdapter {
  const a = adapterFor(model);
  if (a.kind !== "chat") throw new Error(`${model.protocol} is not a chat protocol`);
  return a;
}

export function generationAdapter(model: ModelConfig): GenerationAdapter {
  const a = adapterFor(model);
  if (a.kind !== "generation") throw new Error(`${model.protocol} is not a generation protocol`);
  return a;
}
