import { describe, expect, it } from "vitest";
import { pickByName } from "./pick";
import { toInstance as runpodInstance } from "./runpod";
import { toInstance as vastInstance, vastPublicPort, vastSsh } from "./vast";

describe("pickByName", () => {
  const items = [
    { name: "a", running: false, id: 1 },
    { name: "a", running: true, id: 2 },
    { name: "b", running: false, id: 3 },
  ];
  it("prefers a running machine when names repeat", () => {
    expect(pickByName(items, "a", (i) => i.name, (i) => i.running)?.id).toBe(2);
  });
  it("falls back to a stopped one", () => {
    expect(pickByName(items, "b", (i) => i.name, (i) => i.running)?.id).toBe(3);
  });
});

describe("vast", () => {
  const inst = {
    id: 5,
    label: "flux",
    actual_status: "running",
    gpu_name: "RTX 4090",
    num_gpus: 1,
    dph_total: 0.4,
    public_ipaddr: "1.2.3.4",
    ssh_host: "ssh4.vast.ai",
    ssh_port: 1234,
    ports: { "8188/tcp": [{ HostIp: "0.0.0.0", HostPort: "40001" }] },
  };
  it("maps status and cost", () => {
    expect(vastInstance(inst)).toMatchObject({ status: "running", name: "flux", costPerHour: 0.4 });
    expect(vastInstance({ ...inst, actual_status: "exited" }).status).toBe("stopped");
  });
  it("finds a public port mapping", () => {
    expect(vastPublicPort(inst, 8188)).toBe("http://1.2.3.4:40001");
    expect(vastPublicPort(inst, 8080)).toBeUndefined();
  });
  it("uses the ssh proxy unless port 22 is mapped", () => {
    expect(vastSsh(inst)).toEqual({ host: "ssh4.vast.ai", port: 1234 });
    expect(vastSsh({ ...inst, ports: { "22/tcp": [{ HostIp: "", HostPort: "40022" }] } })).toEqual({ host: "1.2.3.4", port: 40022 });
  });
});

describe("runpod", () => {
  it("maps pod states", () => {
    const pod = { id: "x", name: "p", desiredStatus: "RUNNING", costPerHr: 1, gpuCount: 1, machine: { gpuDisplayName: "NVIDIA A40" }, runtime: null };
    expect(runpodInstance(pod)).toMatchObject({ status: "starting", gpu: "A40" });
    expect(runpodInstance({ ...pod, runtime: { uptimeInSeconds: 5 } }).status).toBe("running");
    expect(runpodInstance({ ...pod, desiredStatus: "EXITED" }).status).toBe("stopped");
  });
});
