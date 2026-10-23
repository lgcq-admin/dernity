import { ImagePlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { defaultParamValues, type ModelConfig, type ParamValues } from "@shared/model";
import { type Chat, type ChatAttachment, type ChatMessage, fileUrl } from "@shared/types";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { StatusDot, statusText } from "@/components/model-status";
import { ParamField } from "@/components/param-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { Health } from "@/hooks/use-data";
import { api } from "@/lib/api";
import { urlToIncoming } from "@/lib/files";
import { newId } from "@/lib/format";

type Props = { chatId: string; model: ModelConfig | undefined; health: Health; onCheck: () => void; onSaved: () => void };

export function ChatView({ chatId, model, health, onCheck, onSaved }: Props) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [params, setParams] = useState<ParamValues>({});
  const [streaming, setStreaming] = useState<string | null>(null);
  const chatRef = useRef<Chat | null>(null);
  chatRef.current = chat;

  useEffect(() => {
    void api.chats.get(chatId).then(setChat);
  }, [chatId]);

  useEffect(() => {
    if (model) setParams(defaultParamValues(model.params));
  }, [model]);

  // Stream deltas into the last assistant message; save once the reply is done.
  useEffect(
    () =>
      api.chats.onDelta((d) => {
        if (d.requestId !== streaming) return;
        setChat((c) => {
          if (!c) return c;
          const messages = c.messages.slice();
          const last = { ...messages.at(-1)! };
          if (d.content) last.content += d.content;
          if (d.reasoning) last.reasoning = (last.reasoning ?? "") + d.reasoning;
          if (d.error) last.error = d.error;
          messages[messages.length - 1] = last;
          const next = { ...c, messages, updatedAt: Date.now() };
          if (d.done) void api.chats.save(next).then(onSaved);
          return next;
        });
        if (d.done) setStreaming(null);
      }),
    [streaming, onSaved],
  );

  const send = async (msg: PromptInputMessage) => {
    const c = chatRef.current;
    if (!c || !model || streaming || (!msg.text.trim() && !msg.files.length)) return;
    const attachments: ChatAttachment[] = [];
    for (const f of msg.files) {
      const name = f.filename ?? "image";
      const { file } = await api.chats.attach(await urlToIncoming(f.url, name, f.mediaType));
      attachments.push({ file, name, type: f.mediaType });
    }
    const user: ChatMessage = { id: newId(), role: "user", content: msg.text, createdAt: Date.now(), ...(attachments.length ? { attachments } : {}) };
    const reply: ChatMessage = { id: newId(), role: "assistant", content: "", createdAt: Date.now() };
    const next: Chat = {
      ...c,
      title: c.messages.length === 0 ? msg.text.slice(0, 60) || "Image" : c.title,
      messages: [...c.messages, user, reply],
      updatedAt: Date.now(),
    };
    setChat(next);
    await api.chats.save(next);
    onSaved();
    const requestId = newId();
    setStreaming(requestId);
    await api.chats.stream({ requestId, chatId: c.id, modelId: model.id, params });
  };

  if (!chat) return null;
  if (!model) return <p className="p-8 text-sm text-muted-foreground">The model of this chat ({chat.modelId}) is no longer configured.</p>;

  const acceptsImages = model.inputs.some((i) => i.accept === "image");
  const last = chat.messages.at(-1);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <StatusDot health={health} onCheck={onCheck} />
        <span className="font-display text-xl leading-none font-light">{model.name}</span>
        <span className="truncate text-xs text-muted-foreground">{statusText(health)}</span>
        <div className="flex-1" />
        <ChatSettings model={model} chat={chat} params={params} setParams={setParams} onSystem={(system) => setChat({ ...chat, system })} />
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {chat.messages.length === 0 && (
            <ConversationEmptyState className="min-h-[60vh]">
              <span className="font-display text-5xl leading-none font-light">{model.name}</span>
              <p className="max-w-md text-sm whitespace-pre-wrap text-muted-foreground">{model.notes ?? "Send a message to start"}</p>
            </ConversationEmptyState>
          )}
          {chat.messages.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.attachments?.map((a) => (
                  <img key={a.file} src={fileUrl("chats", a.file)} alt={a.name} className="max-h-60 rounded-md" />
                ))}
                {m.reasoning && (
                  <Reasoning isStreaming={streaming !== null && m === last && !m.content}>
                    <ReasoningTrigger />
                    <ReasoningContent>{m.reasoning}</ReasoningContent>
                  </Reasoning>
                )}
                {m.role === "assistant" ? <MessageResponse>{m.content}</MessageResponse> : <p className="whitespace-pre-wrap">{m.content}</p>}
                {m.error && <p className="text-sm text-red-400">{m.error}</p>}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <PromptInput
          onSubmit={(m) => void send(m)}
          accept={acceptsImages ? "image/*" : "none/none"}
          multiple
          globalDrop={acceptsImages}
          onError={(e) => toast.error(e.message)}
        >
          <AttachmentPreviews />
          <PromptInputBody>
            <PromptInputTextarea placeholder={`Message ${model.name}`} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>{acceptsImages && <AttachButton />}</PromptInputTools>
            <PromptInputSubmit
              status={streaming ? "streaming" : undefined}
              onStop={() => streaming && void api.chats.abort(streaming)}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function AttachButton() {
  const { openFileDialog } = usePromptInputAttachments();
  return (
    <PromptInputButton onClick={openFileDialog} aria-label="Attach images">
      <ImagePlusIcon className="size-4" />
    </PromptInputButton>
  );
}

function AttachmentPreviews() {
  const { files, remove } = usePromptInputAttachments();
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {files.map((f) => (
        <button key={f.id} type="button" onClick={() => remove(f.id)} title="Remove" className="overflow-hidden rounded-md border">
          <img src={f.url} alt={f.filename} className="size-14 object-cover" />
        </button>
      ))}
    </div>
  );
}

function ChatSettings({
  model,
  chat,
  params,
  setParams,
  onSystem,
}: {
  model: ModelConfig;
  chat: Chat;
  params: ParamValues;
  setParams: (p: ParamValues) => void;
  onSystem: (s: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <SlidersHorizontalIcon /> Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">System prompt</Label>
          <Textarea rows={4} value={chat.system ?? ""} onChange={(e) => onSystem(e.target.value)} placeholder="Optional" />
        </div>
        {model.params.map((p) => (
          <ParamField key={p.key} param={p} value={params[p.key] ?? null} onChange={(v) => setParams({ ...params, [p.key]: v })} />
        ))}
      </PopoverContent>
    </Popover>
  );
}
