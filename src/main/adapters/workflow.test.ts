import { describe, expect, it } from "vitest";
import { deriveValues, fillWorkflow, placeholders } from "./workflow";

describe("deriveValues", () => {
  it("computes width and height from aspect and short edge, rounded to the size step", () => {
    const v = deriveValues("p", { aspect: "16:9", shortEdge: 720, seed: 1 });
    expect([v.width, v.height]).toEqual([1280, 720]);
  });

  it("computes frames as n * frameStep + 1", () => {
    const v = deriveValues("p", { seconds: 5, seed: 1 }, { fps: 16, frameStep: 4 });
    expect(v.frames).toBe(81);
    expect(v.fps).toBe(16);
  });

  it("randomizes an empty seed and keeps a given one", () => {
    expect(typeof deriveValues("p", { seed: null }).seed).toBe("number");
    expect(deriveValues("p", { seed: 42 }).seed).toBe(42);
  });
});

describe("fillWorkflow", () => {
  const graph = {
    "3": { inputs: { seed: "{{seed}}", steps: "{{steps}}", text: "a photo, {{prompt}}" } },
    "5": { inputs: { image: "{{file:refs}}" } },
  };

  it("keeps the value type for exact placeholders and interpolates inline ones", () => {
    const out = fillWorkflow(graph, { seed: 7, steps: 8, prompt: "cat", "file:refs": "a.png" });
    expect(out["3"].inputs).toEqual({ seed: 7, steps: 8, text: "a photo, cat" });
    expect(out["5"].inputs.image).toBe("a.png");
  });

  it("names every placeholder that has no value", () => {
    expect(() => fillWorkflow(graph, { seed: 1, prompt: "x" })).toThrow("{{steps}}, {{file:refs}}");
  });

  it("finds placeholders anywhere in the graph", () => {
    expect([...placeholders(graph)].sort()).toEqual(["file:refs", "prompt", "seed", "steps"]);
  });
});
