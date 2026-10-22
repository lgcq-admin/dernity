import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readTokenFile } from "./token-file";

let root: string;
let secrets: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dernity-token-"));
  secrets = path.join(root, "secrets");
  fs.mkdirSync(secrets);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("readTokenFile", () => {
  it("reads a single-line token", () => {
    fs.writeFileSync(path.join(secrets, "m.token"), "abc123\n");
    expect(readTokenFile(secrets, "m.token")).toBe("abc123");
  });

  it("refuses a symlink to another file", () => {
    fs.writeFileSync(path.join(root, "aws-credentials"), "secret");
    fs.symlinkSync(path.join(root, "aws-credentials"), path.join(secrets, "m.token"));
    expect(() => readTokenFile(secrets, "m.token")).toThrow("not a link");
  });

  it("refuses a hard link to another secret", () => {
    fs.writeFileSync(path.join(root, "vast_api_key"), "single-line-secret");
    fs.linkSync(path.join(root, "vast_api_key"), path.join(secrets, "m.token"));
    expect(() => readTokenFile(secrets, "m.token")).toThrow("plain file");
  });

  it("refuses multi-line or oversized content", () => {
    fs.writeFileSync(path.join(secrets, "multi.token"), "[default]\naws_secret=x\n");
    fs.writeFileSync(path.join(secrets, "big.token"), "x".repeat(5000));
    expect(() => readTokenFile(secrets, "multi.token")).toThrow("one printable token");
    expect(() => readTokenFile(secrets, "big.token")).toThrow("too large");
  });

  it("refuses names with path parts", () => {
    expect(() => readTokenFile(secrets, "../x")).toThrow("Invalid token file name");
  });
});
