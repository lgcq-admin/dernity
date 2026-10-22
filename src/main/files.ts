// dernity-file://library/<date>/<id>/<file> and dernity-file://chats/<file>: local media for the renderer,
// confined to those two folders. Registered as a streaming scheme so <video> can seek.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { FILE_SCHEME } from "@shared/types";
import { CHAT_FILES, inside, LIBRARY } from "./paths";

export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function handleFileScheme(): void {
  protocol.handle(FILE_SCHEME, (req) => {
    const url = new URL(req.url);
    const root = url.hostname === "library" ? LIBRARY : url.hostname === "chats" ? CHAT_FILES : null;
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = root ? inside(root, rel.split("/").join(path.sep)) : null;
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
  });
}
