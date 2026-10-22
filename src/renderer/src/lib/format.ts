export const money = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
