import { FolderOpenIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { Generation } from "@shared/types";
import { GenerationCard } from "@/components/generation-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export function LibraryView({ generations, onOpen }: { generations: Generation[]; onOpen: (g: Generation) => void }) {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("all");

  const models = useMemo(() => [...new Map(generations.map((g) => [g.modelId, g.modelName])).entries()], [generations]);
  const shown = generations.filter(
    (g) => (model === "all" || g.modelId === model) && (!query || g.prompt.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-sm font-medium">Library</span>
        <span className="text-xs text-muted-foreground">{shown.length} items</span>
        <div className="flex-1" />
        <div className="relative w-64">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder="Search prompts" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            {models.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => void api.app.openPath("library")} title="Open library folder">
          <FolderOpenIcon className="size-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {shown.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-4">
            {shown.map((g) => (
              <GenerationCard key={g.id} g={g} onOpen={() => onOpen(g)} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
