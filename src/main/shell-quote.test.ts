import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { shellQuote } from "./shell-quote";

describe("shellQuote", () => {
  it("passes any text to the shell as one literal word", () => {
    const text = `it's "fine"; $(rm -rf ~) \`x\` \\n`;
    expect(execFileSync("sh", ["-c", `printf %s ${shellQuote(text)}`], { encoding: "utf8" })).toBe(text);
  });
});
