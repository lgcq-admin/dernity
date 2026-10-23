import { describe, expect, it } from "vitest";
import type { Param } from "./model";
import { fieldLayout, missingRequired, normalizeNumber, paramOptions, readNumber, stepNumber } from "./params";

const param = (p: Partial<Param>): Param => ({ key: "k", label: "K", type: "number", ...p });

describe("fieldLayout", () => {
  it("puts long select labels on their own row", () => {
    const p = param({ type: "select", options: [{ value: "lora/very_long_file_name_v2.safetensors", label: "Very long LoRA name v2" }] });
    expect(fieldLayout(p)).toEqual({ control: "select", wide: true });
  });

  it("turns a few short choices into buttons", () => {
    expect(fieldLayout(param({ type: "select", options: ["low", "high"] })).control).toBe("segmented");
    expect(fieldLayout(param({ type: "select", options: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"] })).control).toBe("select");
  });

  it("uses a slider only for bounded numbers", () => {
    expect(fieldLayout(param({ min: 1, max: 50 })).control).toBe("slider");
    expect(fieldLayout(param({ min: 0 })).control).toBe("number");
  });
});

it("appends the suffix to plain options and keeps explicit labels", () => {
  expect(paramOptions(param({ type: "select", suffix: "px", options: [512, { value: "a", label: "A" }] }))).toEqual([
    { value: 512, label: "512 px" },
    { value: "a", label: "A" },
  ]);
});

it("reads typed numbers, commas included", () => {
  expect(readNumber("0,7")).toBe(0.7);
  expect(readNumber(" ")).toBeNull();
  expect(readNumber("12a")).toBeUndefined();
});

it("clamps and snaps to the step counted from min", () => {
  const p = param({ min: 4, max: 30, step: 2 });
  expect(normalizeNumber(7.2, p)).toBe(8);
  expect(normalizeNumber(99, p)).toBe(30);
  expect(normalizeNumber(0.30000000000000004, param({ step: 0.1 }))).toBe(0.3);
});

it("steps from min when the value is auto", () => {
  expect(stepNumber(null, param({ min: 1, max: 5 }), 1)).toBe(2);
});

it("lists what's missing in form order", () => {
  const model = {
    prompt: "required" as const,
    inputs: [{ key: "first_frame", label: "First frame", accept: "image" as const, max: 1, required: true }],
    params: [param({ key: "lora", label: "LoRA", type: "select", options: ["a"], required: true })],
  };
  expect(missingRequired(model, { prompt: " ", params: { lora: null }, fileCounts: {} })).toEqual(["Prompt", "First frame", "LoRA"]);
  expect(missingRequired({ ...model, prompt: "optional" }, { prompt: "", params: { lora: "a" }, fileCounts: { first_frame: 1 } })).toEqual([]);
});
