import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground",
        className,
      )}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}
