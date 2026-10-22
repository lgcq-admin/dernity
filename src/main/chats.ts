// Text chats: one JSON file per chat in chats/, attachments content-addressed in chats/files/.
// The renderer owns the conversation state and saves it; main streams replies for a saved chat.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type Chat, ChatSchema, type ChatDelta, type ChatStreamRequest, type ChatSummary, type IncomingFile } from "@shared/types";
import { chatAdapter } from "./adapters";
import type { ChatTurn } from "./adapters/types";
import { connect } from "./hosts";
import { getModel } from "./models";
import { CHAT_FILES, CHATS } from "./paths";

const chatFile = (id: string) => path.join(CHATS, `${id}.json`);

export function listChats(): ChatSummary[] {
  return fs
    .readdirSync(CHATS)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        const c = JSON.parse(fs.readFileSync(path.join(CHATS, f), "utf8")) as Chat;
        return [{ id: c.id, title: c.title, modelId: c.modelId, updatedAt: c.updatedAt }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getChat(id: string): Chat | null {
  const file = chatFile(ChatSchema.shape.id.parse(id));
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Chat) : null;
}

export function saveChat(chat: Chat): void {
  const valid = ChatSchema.parse(chat);
  fs.writeFileSync(chatFile(valid.id), JSON.stringify(valid, null, 2) + "\n");
}

export function removeChat(id: string): void {
  fs.rmSync(chatFile(ChatSchema.shape.id.parse(id)), { force: true });
}

export function attachFile(file: IncomingFile): { file: string } {
  const hash = createHash("sha256").update(file.data).digest("hex").slice(0, 16);
  const name = hash + (path.extname(file.name).toLowerCase().replace(/[^.\w]/g, "") || ".bin");
  const target = path.join(CHAT_FILES, name);
  if (!fs.existsSync(target)) fs.writeFileSync(target, file.data);
  return { file: name };
}

export function toTurns(chat: Chat, withImages: boolean): ChatTurn[] {
  const turns: ChatTurn[] = chat.system?.trim() ? [{ role: "system", content: chat.system }] : [];
  for (const m of chat.messages) {
    if (m.role === "assistant" && !m.content) continue; // the reply being streamed, or a failed one
    const images = withImages
      ? (m.attachments ?? [])
          .filter((a) => a.type.startsWith("image/"))
          .map((a) => ({ type: a.type, base64: fs.readFileSync(path.join(CHAT_FILES, path.basename(a.file))).toString("base64") }))
      : [];
    turns.push({ role: m.role, content: m.content, ...(images.length ? { images } : {}) });
  }
  return turns;
}

const active = new Map<string, AbortController>();

export async function streamChat(req: ChatStreamRequest, emit: (d: ChatDelta) => void): Promise<void> {
  const controller = new AbortController();
  active.set(req.requestId, controller);
  try {
    const chat = getChat(req.chatId);
    if (!chat) throw new Error("Chat not found");
    const model = getModel(req.modelId);
    const adapter = chatAdapter(model);
    const conn = await connect(model);
    const withImages = model.inputs.some((i) => i.accept === "image");
    await adapter.stream(conn, model, toTurns(chat, withImages), req.params, controller.signal, (d) =>
      emit({ requestId: req.requestId, ...d }),
    );
    emit({ requestId: req.requestId, done: true });
  } catch (err) {
    if (controller.signal.aborted) emit({ requestId: req.requestId, done: true });
    else emit({ requestId: req.requestId, done: true, error: (err as Error).message });
  } finally {
    active.delete(req.requestId);
  }
}

export function abortChat(requestId: string): void {
  active.get(requestId)?.abort();
}
