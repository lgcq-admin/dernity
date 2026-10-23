// Renderer-side state that mirrors main: models (with health), generations, chats.
import { useCallback, useEffect, useState } from "react";
import type { ModelConfig, ModelEntry, ModelHealth } from "@shared/model";
import type { BestiaryFile } from "@shared/bestiary";
import type { ChatSummary, Generation } from "@shared/types";
import { api } from "@/lib/api";

export function useModels() {
  const [entries, setEntries] = useState<ModelEntry[]>([]);
  const [health, setHealth] = useState<Record<string, ModelHealth | "checking">>({});

  // Main checks health in the background and pushes every result; this only asks for a check now.
  const check = useCallback(async (id: string) => {
    setHealth((h) => ({ ...h, [id]: "checking" }));
    await api.models.health(id);
  }, []);

  useEffect(() => {
    void api.models.list().then(setEntries);
    void api.models.healthAll().then((all) => setHealth((h) => ({ ...all, ...h })));
    const offModels = api.models.onChanged(setEntries);
    const offHealth = api.models.onHealth((id, result) => setHealth((h) => ({ ...h, [id]: result })));
    return () => {
      offModels();
      offHealth();
    };
  }, []);

  const models = entries.flatMap((e) => (e.config ? [e.config] : []));
  const invalid = entries.filter((e) => !e.config);
  return { models, invalid, health, check };
}

export function useGenerations() {
  const [items, setItems] = useState<Generation[]>([]);
  useEffect(() => {
    void api.generations.list().then(setItems);
    return api.generations.onUpdate((g) =>
      setItems((list) => {
        const i = list.findIndex((x) => x.id === g.id);
        if (i === -1) return [g, ...list];
        const next = list.slice();
        next[i] = g;
        return next;
      }),
    );
  }, []);
  const remove = useCallback(async (id: string) => {
    await api.generations.remove(id);
    setItems((list) => list.filter((g) => g.id !== id));
  }, []);
  return { items, remove };
}

export function useBestiary() {
  const [files, setFiles] = useState<BestiaryFile[]>([]);
  useEffect(() => {
    void api.bestiary.list().then(setFiles);
    return api.bestiary.onChanged(setFiles);
  }, []);
  const entries = files.flatMap((f) => (f.entry ? [f.entry] : []));
  return { entries, invalid: files.filter((f) => !f.entry) };
}

export function useChats() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const refresh = useCallback(() => void api.chats.list().then(setChats), []);
  useEffect(refresh, [refresh]);
  return { chats, refresh };
}

export type ModelsState = ReturnType<typeof useModels>;
export type Health = ModelHealth | "checking" | undefined;
export const findModel = (models: ModelConfig[], id: string) => models.find((m) => m.id === id);
