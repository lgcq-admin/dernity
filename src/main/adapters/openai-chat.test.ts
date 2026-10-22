import { describe, expect, it } from "vitest";
import { ModelConfigSchema } from "@shared/model";
import { describeServer, toOpenAiMessages } from "./openai-chat";

describe("toOpenAiMessages", () => {
  it("sends images as image_url parts before the text", () => {
    const [msg] = toOpenAiMessages([{ role: "user", content: "what is this", images: [{ type: "image/png", base64: "AAA" }] }]);
    expect(msg!.content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
      { type: "text", text: "what is this" },
    ]);
  });

  it("keeps plain text messages as strings", () => {
    expect(toOpenAiMessages([{ role: "system", content: "be brief" }])).toEqual([{ role: "system", content: "be brief" }]);
  });
});

describe("describeServer", () => {
  const model = ModelConfigSchema.parse({ id: "m", name: "M", kind: "chat", protocol: "openai-chat", host: { type: "url", url: "http://x.test" } });

  it("returns the served model id", () => {
    expect(describeServer({ data: [{ id: "qwen3-8b" }], models: [{ capabilities: ["completion"] }] }, model)).toBe("qwen3-8b");
  });

  it("flags a vision server whose config has no image input", () => {
    expect(describeServer({ data: [{ id: "vl" }], models: [{ capabilities: ["completion", "multimodal"] }] }, model)).toContain("no image input");
  });
});
