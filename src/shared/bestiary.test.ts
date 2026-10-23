import fs from "node:fs";
import { expect, it } from "vitest";
import { guideFor, parseBestiaryFile } from "./bestiary";

const example = fs.readFileSync("workspace/examples/bestiary/wan22-i2v.json", "utf8");

it("accepts the example guide shipped to the agent", () => {
  expect(parseBestiaryFile("wan22-i2v.json", example).error).toBeUndefined();
});

it("only allows http(s) source links", () => {
  const raw = { ...JSON.parse(example), sources: [{ label: "x", url: "javascript:alert(1)" }] };
  expect(parseBestiaryFile("x.json", JSON.stringify(raw)).error).toContain("sources.0.url");
});

it("finds the guide that lists a model config", () => {
  const { entry } = parseBestiaryFile("wan22-i2v.json", example);
  expect(guideFor([entry!], "wan22-i2v")?.id).toBe("wan22-i2v");
  expect(guideFor([entry!], "other")).toBeUndefined();
});
