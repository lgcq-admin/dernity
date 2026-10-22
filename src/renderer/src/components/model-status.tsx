import type { Health } from "@/hooks/use-data";
import { cn } from "@/lib/utils";

export function StatusDot({ health, className, onCheck }: { health: Health; className?: string; onCheck?: () => void }) {
  const color =
    health === "checking" || health === undefined ? "bg-muted-foreground/40 animate-pulse" : health.ok ? "bg-primary" : "bg-red-500/80";
  const dot = <span className={cn("inline-block size-2 shrink-0 rounded-full", color, !onCheck && className)} />;
  if (!onCheck) return dot;
  return (
    <span
      role="button"
      tabIndex={0}
      title="Check now"
      className={cn("-m-1.5 rounded-full p-1.5 hover:bg-accent", className)}
      onClick={(e) => {
        e.stopPropagation();
        onCheck();
      }}
      onKeyDown={(e) => e.key === "Enter" && onCheck()}
    >
      {dot}
    </span>
  );
}

export function statusText(health: Health): string {
  if (health === undefined || health === "checking") return "Checking…";
  return health.ok ? `Ready${health.detail ? ` · ${health.detail}` : ""}` : (health.detail ?? "Unreachable");
}
