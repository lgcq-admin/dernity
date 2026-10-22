import type { IncomingFile } from "@shared/types";

export async function fileToIncoming(file: File): Promise<IncomingFile> {
  return { name: file.name || "file", type: file.type, data: new Uint8Array(await file.arrayBuffer()) };
}

export async function urlToIncoming(url: string, name: string, type: string): Promise<IncomingFile> {
  const res = await fetch(url);
  return { name, type: type || res.headers.get("content-type") || "", data: new Uint8Array(await res.arrayBuffer()) };
}

export const acceptAttr = (accept: "image" | "video" | "audio" | "any") => (accept === "any" ? undefined : `${accept}/*`);

export const isVideo = (name: string) => /\.(mp4|webm|mov|mkv)$/i.test(name);
export const isImage = (name: string) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
