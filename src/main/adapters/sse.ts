// Minimal Server-Sent Events parser for streamed chat completions.
export function splitSse(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  const events = parts
    .map((block) =>
      block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n"),
    )
    .filter((data) => data.length > 0);
  return { events, rest };
}
