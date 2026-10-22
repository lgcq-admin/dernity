// The Dernity mark, shared with the website: the rotor of a GPU fan seen head-on, six swept blades cut
// from a solid disc around the hub.
const PATHS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2;
  const p = (r: number, t: number) => `${(16 + r * Math.cos(t)).toFixed(2)} ${(16 + r * Math.sin(t)).toFixed(2)}`;
  return `M${p(3.6, a)} Q${p((3.6 + 16.2) * 0.55, a + 0.42)} ${p(16.2, a + 0.98)}`;
});

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="15.5" fill="#76B900" />
      {PATHS.map((d) => (
        <path key={d} d={d} fill="none" stroke="#060806" strokeWidth="2.1" strokeLinecap="round" />
      ))}
      <circle cx="16" cy="16" r="3.3" fill="#060806" />
      <circle cx="16" cy="16" r="1.3" fill="#76B900" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={`font-display font-semibold tracking-[0.06em] uppercase ${className ?? ""}`}>Dernity</span>;
}
