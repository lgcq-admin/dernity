// Reads a server token from workspace/secrets/. The agent controls that folder, so a "token" could be a
// symlink to some other secret on disk; only a small single-line regular file directly inside it counts.
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 4096;

export function readTokenFile(dir: string, name: string): string {
  if (path.basename(name) !== name || name.startsWith(".")) throw new Error(`Invalid token file name: ${name}`);
  const file = path.join(dir, name);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw new Error(`Token file secrets/${name} not found`);
  }
  if (!stat.isFile()) throw new Error(`Token file secrets/${name} must be a regular file, not a link`);
  if (path.dirname(fs.realpathSync(file)) !== fs.realpathSync(dir)) throw new Error(`Token file secrets/${name} is outside secrets/`);
  // O_NONBLOCK: a FIFO swapped in after the checks above can't hang the main process on open.
  const { O_RDONLY, O_NOFOLLOW = 0, O_NONBLOCK = 0 } = fs.constants;
  const fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    // Re-check the opened file itself: same inode, a regular file, no hard links (which would let any
    // single-line secret pass as a token), and a bounded read whatever the size says.
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== stat.ino || opened.dev !== stat.dev) {
      throw new Error(`Token file secrets/${name} must be a plain file created for this purpose`);
    }
    const buf = Buffer.alloc(MAX_BYTES + 1);
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    if (read > MAX_BYTES) throw new Error(`Token file secrets/${name} is too large`);
    const token = buf.subarray(0, read).toString("utf8").trim();
    if (!token || !/^[\x21-\x7e]+$/.test(token)) throw new Error(`Token file secrets/${name} must hold one printable token`);
    return token;
  } finally {
    fs.closeSync(fd);
  }
}
