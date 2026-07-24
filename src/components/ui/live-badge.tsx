import { cn } from "@/lib/utils";

export function LiveBadge({ className, live = true }: { className?: string; live?: boolean }) {
  if (!live) {
    return (
      <span className={cn("chip bg-surface-2 text-muted", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        OFFLINE
      </span>
    );
  }
  return (
    <span className={cn("chip bg-live/15 text-live", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
      EN VIVO
    </span>
  );
}

export function ViewerCount({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("chip bg-surface-2 text-fg", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-live" />
      {new Intl.NumberFormat("es", { notation: "compact" }).format(count)}
    </span>
  );
}
