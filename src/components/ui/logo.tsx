import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-black shadow-glow">
        <span className="text-sm font-black">φ</span>
      </span>
      <span className="text-lg">
        TV<span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">PHI</span>
      </span>
    </span>
  );
}
