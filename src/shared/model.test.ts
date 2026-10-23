import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultParamValues, parseModelFile } from "./model";

describe("parseModelFile", () => {
  it("accepts every example shipped to the agent", () => {
    const dir = path.resolve("workspace/examples");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const entry = parseModelFile(file, fs.readFileSync(path.join(dir, file), "utf8"));
      expect(entry.error, file).toBeUndefined();
    }
  });

  it("applies defaults for inputs, params and options", () => {
    const { config } = parseModelFile("m.json", JSON.stringify({ id: "m", name: "M", kind: "chat", protocol: "openai-chat", host: { type: "url", url: "http://localhost:8080" } }));
    expect(config).toMatchObject({ inputs: [], params: [], options: {} });
  });

  it("reports the path of each problem", () => {
    const { error } = parseModelFile("m.json", JSON.stringify({ id: "Bad Id", name: "M", kind: "chat", protocol: "openai-chat", host: { type: "vast", port: 0 } }));
    expect(error).toContain("id:");
    expect(error).toContain("host.port");
  });

  it("rejects SSH fields that could be read as ssh options", () => {
    const host = { type: "ssh", ip: "-oProxyCommand=x", port: 8000, user: "-x", sshKey: "-F/tmp/cfg" };
    const { error } = parseModelFile("m.json", JSON.stringify({ id: "m", name: "M", kind: "chat", protocol: "openai-chat", host }));
    expect(error).toContain("host.ip");
    expect(error).toContain("host.user");
    expect(error).toContain("host.sshKey");
  });

  it("only allows DERNITY_* variables as server tokens", () => {
    const base = { id: "m", name: "M", kind: "chat", protocol: "openai-chat", host: { type: "url", url: "http://x.test" } };
    expect(parseModelFile("m.json", JSON.stringify({ ...base, apiKeyEnv: "AWS_SECRET_ACCESS_KEY" })).error).toContain("apiKeyEnv");
    expect(parseModelFile("m.json", JSON.stringify({ ...base, apiKeyEnv: "DERNITY_QWEN_TOKEN" })).error).toBeUndefined();
  });

  it("keeps apiKeyFile a plain file name", () => {
    const base = { id: "m", name: "M", kind: "chat", protocol: "openai-chat", host: { type: "url", url: "http://x.test" } };
    expect(parseModelFile("m.json", JSON.stringify({ ...base, apiKeyFile: "m.token" })).error).toBeUndefined();
    expect(parseModelFile("m.json", JSON.stringify({ ...base, apiKeyFile: "../../.ssh/id_rsa" })).error).toContain("apiKeyFile");
  });

  it("reports invalid JSON", () => {
    expect(parseModelFile("m.json", "{").error).toMatch(/^Invalid JSON/);
  });
});

describe("defaultParamValues", () => {
  it("uses null when a param has no default", () => {
    expect(defaultParamValues([{ key: "seed", label: "Seed", type: "number" }, { key: "steps", label: "Steps", type: "number", default: 8 }])).toEqual({ seed: null, steps: 8 });
  });
});
