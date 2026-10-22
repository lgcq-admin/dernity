// A re-created pod/instance gets a new id but keeps its name; a running one wins when names repeat.
export function pickByName<T>(
  items: T[],
  name: string,
  getName: (t: T) => string | null | undefined,
  isRunning: (t: T) => boolean,
): T | undefined {
  const hits = items.filter((i) => getName(i) === name);
  return hits.find(isRunning) ?? hits[0];
}
