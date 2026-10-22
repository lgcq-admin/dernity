import { describe, expect, it } from "vitest";
import type { Instance } from "./types";
import { joinHistory, observe, parseDeployments, RUN_GAP_MS, runCost, runHours } from "./history";

const inst = (over: Partial<Instance> = {}): Instance => ({
  provider: "vast",
  id: "1",
  name: "qwen3-8b",
  status: "running",
  gpu: "RTX A4000",
  gpuCount: 1,
  costPerHour: 0.12,
  ...over,
});
const H = 3_600_000;
const MIN = 60_000;

// Polls once a minute from `from` to `to`, as the app does while open.
function poll(h: ReturnType<typeof observe>, from: number, to: number, i: Instance = inst()) {
  for (let t = from; t <= to; t += MIN) h = observe(h, [i], ["vast"], t);
  return h;
}

describe("observe", () => {
  it("extends a run while the machine keeps running", () => {
    let h = observe({}, [inst()], ["vast"], 0);
    h = observe(h, [inst()], ["vast"], 60_000);
    h = observe(h, [inst()], ["vast"], 120_000);
    expect(h["vast:1"]!.runs).toEqual([{ from: 0, to: 120_000, pricePerHour: 0.12 }]);
  });

  it("starts a new run after a gap it didn't observe, without billing the gap", () => {
    let h = poll({}, 0, H / 2);
    h = poll(h, H / 2 + RUN_GAP_MS + MIN, H + RUN_GAP_MS + MIN);
    expect(h["vast:1"]!.runs).toHaveLength(2);
    expect(runHours(h["vast:1"]!)).toBeCloseTo(1);
  });

  it("marks machines missing from a provider that answered as deleted", () => {
    let h = observe({}, [inst()], ["vast"], 0);
    h = observe(h, [], ["runpod"], 10);
    expect(h["vast:1"]!.status).toBe("running");
    h = observe(h, [], ["vast"], 20);
    expect(h["vast:1"]).toMatchObject({ status: "deleted", deletedAt: 20 });
  });

  it("prices each run at the rate it ran at", () => {
    let h = poll({}, 0, H / 2, inst({ costPerHour: 1 }));
    h = poll(h, H / 2 + MIN, H, inst({ costPerHour: 2 }));
    expect(h["vast:1"]!.runs).toHaveLength(2);
    expect(runCost(h["vast:1"]!)).toBeCloseTo(1.5);
  });
});

describe("deployments", () => {
  const line = (o: object) => JSON.stringify({ at: "2026-10-22T19:00:00Z", model: "Qwen/Qwen3-8B-GGUF", provider: "vast", machine: "qwen3-8b", ...o });

  it("skips invalid lines and derives missing ids", () => {
    const { deployments, invalid } = parseDeployments([line({}), "not json", JSON.stringify({ model: "x" }), ""].join("\n"));
    expect(invalid).toBe(2);
    expect(deployments[0]!.id).toMatch(/^qwen3-8b-2026-10-22T19-00-00Z$/);
  });

  it("pairs a machine with its latest deployment and keeps unmatched ones", () => {
    const { deployments } = parseDeployments(
      [line({ id: "old", at: "2026-10-20T10:00:00Z" }), line({ id: "new" }), line({ id: "other", machine: "flux" })].join("\n"),
    );
    const machine = observe({}, [inst()], ["vast"], Date.parse("2026-10-22T19:05:00Z"))["vast:1"]!;
    const entries = joinHistory([machine], deployments);
    expect(entries.find((e) => e.machine)?.deployment?.id).toBe("new");
    expect(entries.filter((e) => !e.machine).map((e) => e.deployment!.id).sort()).toEqual(["old", "other"]);
  });
});
