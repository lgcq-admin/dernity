import { describe, expect, it } from "vitest";
import { splitSse } from "./sse";

describe("splitSse", () => {
  it("returns complete events and keeps the unfinished tail", () => {
    const { events, rest } = splitSse('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"b"');
    expect(events).toEqual(['{"a":1}', "[DONE]"]);
    expect(rest).toBe('data: {"b"');
  });

  it("handles CRLF and ignores comments", () => {
    expect(splitSse(": ping\r\n\r\ndata: x\r\n\r\n").events).toEqual(["x"]);
  });
});
