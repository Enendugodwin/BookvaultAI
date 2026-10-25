import type { Heatmap } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

function level(value: number, max: number) {
  if (!value) return 0;
  if (!max) return 1;
  const ratio = value / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

const LEVEL_STYLE: Record<number, string> = {
  0: "bg-muted/70",
  1: "bg-primary/20",
  2: "bg-primary/40",
  3: "bg-primary/65",
  4: "bg-primary",
};

export function ReadingHeatmap({
  data,
  onSelectDay,
  selectedDay,
  metricLabel = "pages",
}: {
  data: Heatmap;
  onSelectDay?: (day: string) => void;
  selectedDay?: string;
  metricLabel?: string;
}) {
  const days = data.days;
  if (!days.length) return null;
  const first = new Date(`${days[0].date}T00:00:00`);
  const leading = first.getDay();
  const cells: ({ date: string; value: number; pages: number; minutes: number; sessions: number } | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...days,
  ];
  while (cells.length % 7) cells.push(null);

  const monthCols: { index: number; label: string }[] = [];
  let lastMonth = -1;
  const columns = cells.length / 7;
  for (let col = 0; col < columns; col += 1) {
    const cell = cells[col * 7];
    if (cell) {
      const month = new Date(`${cell.date}T00:00:00`).getMonth();
      if (month !== lastMonth) {
        if (col < columns - 1) monthCols.push({ index: col, label: MONTHS[month] });
        lastMonth = month;
      }
    }
  }

  return (
    <div className="w-full overflow-x-auto pb-1 scrollbar-thin">
      <div className="min-w-[680px]">
        <div className="mb-1.5 ml-[26px] grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, col) => {
            const month = monthCols.find((m) => m.index === col);
            return <span key={col} className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{month?.label ?? ""}</span>;
          })}
        </div>
        <div className="flex gap-1">
          <div className="grid w-5 shrink-0 gap-[3px] pt-[1px]" style={{ gridTemplateRows: "repeat(7, 11px)" }}>
            {DAYS.map((day, index) => (
              <span key={index} className="text-[8.5px] leading-[11px] text-muted-foreground">{day}</span>
            ))}
          </div>
          <div
            className="grid flex-1 gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoFlow: "column", gridTemplateRows: "repeat(7, 11px)" }}
          >
            {cells.map((cell, index) =>
              cell ? (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => onSelectDay?.(cell.date)}
                  title={`${formatDate(cell.date)} — ${cell.pages} pages · ${Math.round(cell.minutes)} minutes · ${cell.sessions} sessions`}
                  aria-label={`${cell.date}: ${cell.value} ${metricLabel}`}
                  className={cn(
                    "h-[11px] w-full rounded-[2px] transition-transform hover:scale-125",
                    LEVEL_STYLE[level(cell.value, data.max_value)],
                    selectedDay === cell.date && "ring-1 ring-foreground ring-offset-1 ring-offset-card",
                    onSelectDay && "cursor-pointer",
                  )}
                />
              ) : (
                <span key={`empty-${index}`} className="h-[11px] w-full" />
              ),
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10.5px] text-muted-foreground">
          <span>{data.total.toLocaleString()} {metricLabel} in {data.year}</span>
          <span className="flex items-center gap-1">
            Less
            {[0, 1, 2, 3, 4].map((value) => (
              <span key={value} className={cn("h-[10px] w-[10px] rounded-[2px]", LEVEL_STYLE[value])} />
            ))}
            More
          </span>
        </div>
      </div>
    </div>
  );
}
