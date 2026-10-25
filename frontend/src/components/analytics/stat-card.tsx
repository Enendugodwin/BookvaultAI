import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  trend?: { value: number; label?: string; invert?: boolean };
  className?: string;
}) {
  const positive = trend ? (trend.invert ? trend.value < 0 : trend.value > 0) : false;
  const flat = trend?.value === 0;
  return (
    <div className={cn("surface p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
        {Icon && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/70 text-foreground/55">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="mt-2.5 font-display text-[1.9rem] font-semibold leading-none tabular-nums">{value}</p>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        {trend && !flat && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-success" : "text-destructive")}>
            {trend.value > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend.value).toFixed(0)}%
          </span>
        )}
        {trend?.label && <span>{trend.label}</span>}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
