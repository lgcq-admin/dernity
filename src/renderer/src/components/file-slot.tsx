// A file input declared by the model (refs, first frame, last frame…): drop, paste or pick, with previews.
import { ImagePlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileInput } from "@shared/model";
import { acceptAttr } from "@/lib/files";
import { cn } from "@/lib/utils";

type Props = { input: FileInput; files: File[]; onChange: (files: File[]) => void };

export function FileSlot({ input, files, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);

  const accepts = (f: File) => input.accept === "any" || f.type.startsWith(`${input.accept}/`);
  const add = (list: FileList | File[]) => {
    const next = [...files, ...Array.from(list).filter(accepts)];
    onChange(input.max === 1 ? next.slice(-1) : next.slice(0, input.max));
  };

  const full = files.length >= input.max && input.max > 1;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>
          {input.label}
          {input.required && <span className="text-red-400" aria-label="required"> *</span>}
        </span>
        {input.max > 1 && (
          <span>
            {files.length}/{input.max}
          </span>
        )}
      </div>
      <div
        className={cn(
          "flex min-h-20 flex-wrap gap-2 rounded-lg border border-dashed p-2 transition-colors",
          dragging && "border-foreground/40 bg-accent",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        onPaste={(e) => add(e.clipboardData.files)}
        tabIndex={0}
      >
        {files.map((f, i) => (
          <div key={urls[i]} className="group relative size-16 overflow-hidden rounded-md border bg-muted">
            {f.type.startsWith("video/") ? (
              <video src={urls[i]} className="size-full object-cover" muted />
            ) : f.type.startsWith("image/") ? (
              <img src={urls[i]} alt={f.name} className="size-full object-cover" />
            ) : (
              <span className="p-1 text-[10px] break-all">{f.name}</span>
            )}
            <button
              type="button"
              className="absolute top-0.5 right-0.5 hidden rounded-full bg-background/80 p-0.5 group-hover:block"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="flex size-16 flex-col items-center justify-center gap-1 rounded-md border text-muted-foreground hover:bg-accent"
          >
            <ImagePlusIcon className="size-4" />
            <span className="text-[10px]">Add</span>
          </button>
        )}
      </div>
      {input.hint && <p className="text-xs text-muted-foreground/80">{input.hint}</p>}
      <input
        ref={ref}
        type="file"
        hidden
        accept={acceptAttr(input.accept)}
        multiple={input.max > 1}
        onChange={(e) => {
          if (e.target.files) add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
