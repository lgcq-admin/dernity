// Reading files from folders the agent controls (workspace/secrets, workspace/workflows). Their contents
// get sent to model servers, so a planted symlink or hard link must not smuggle in some other file from
// disk: only a regular, single-link file whose real path is inside the folder counts.
import fs from "node:fs";
import path from "node:path";

export function readConfinedFile(dir: string, rel: string, maxBytes: number, label = rel): Buffer {
  const file = path.resolve(dir, rel);
  if (!file.startsWith(path.resolve(dir) + path.sep)) throw new Error(`${label} is outside its folder`);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw new Error(`${label} not found`);
  }
  if (!stat.isFile()) throw new Error(`${label} must be a regular file, not a link`);
  // Catches symlinked parent folders too.
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(dir) + path.sep)) throw new Error(`${label} is outside its folder`);

  // O_NONBLOCK: a FIFO swapped in after the checks above can't hang the main process on open.
  const { O_RDONLY, O_NOFOLLOW = 0, O_NONBLOCK = 0 } = fs.constants;
  const fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    // Re-check the opened file itself: same inode, regular, and no hard links to some other file.
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== stat.ino || opened.dev !== stat.dev) {
      throw new Error(`${label} must be a plain file, not a link to another file`);
    }
    const buf = Buffer.alloc(maxBytes + 1);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    if (read > maxBytes) throw new Error(`${label} is too large`);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

export function readTokenFile(dir: string, name: string): string {
  if (path.basename(name) !== name || name.startsWith(".")) throw new Error(`Invalid token file name: ${name}`);
  const label = `Token file secrets/${name}`;
  const token = readConfinedFile(dir, name, 4096, label).toString("utf8").trim();
  if (!token || !/^[\x21-\x7e]+$/.test(token)) throw new Error(`${label} must hold one printable token`);
  return token;
}
