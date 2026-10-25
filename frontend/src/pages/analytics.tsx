import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BookCheck, BookOpen, Clock3, Download, Flame, Layers, TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatMinutes, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { ReadingHeatmap } from "@/components/analytics/heatmap";
import { ExportDialog } from "@/components/data/export-dialog";

const COLORS = ["#c25a32", "#5f7f68", "#c9a227", "#7b5a8c", "#4f7a8c", "#a8a29e"];

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "prev_year", label: "Last year" },
  { value: "custom", label: "Custom range" },
];

function change(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function AnalyticsPage() {
  const [preset, setPreset] = useState("30d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [metric, setMetric] = useState<"pages" | "minutes" | "sessions">("pages");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const overview = useQuery({
    queryKey: ["analytics", "overview", preset, start, end],
    queryFn: () => api.analytics.overview({ preset, start: start || undefined, end: end || undefined }),
    enabled: preset !== "custom" || Boolean(start && end),
  });

  const summary = useQuery({ queryKey: ["summary"], queryFn: api.analytics.summary });

  const heatmap = useQuery({
    queryKey: ["analytics", "heatmap", year, metric],
    queryFn: () => api.analytics.heatmap(year, metric),
  });

  const dayDetail = useQuery({
    queryKey: ["analytics", "day", selectedDay],
    queryFn: () => api.analytics.day(selectedDay!),
    enabled: Boolean(selectedDay),
  });

  const data = overview.data;
  const totals = data?.totals;
  const previous = data?.previous_totals;
  const activeDays = data?.daily.filter((day) => day.sessions > 0).length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Patterns"
        title="Analytics"
        description="Time, pages and consistency — measured from what you actually logged."
        actions={
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4" /> PDF report
          </Button>
        }
      />

      <div className="surface flex flex-wrap items-end gap-3 p-3.5">
        <div>
          <label htmlFor="range" className="label">Range</label>
          <Select
            id="range"
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
            className="w-auto min-w-[150px]"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div>
              <label htmlFor="range-start" className="label">Start</label>
              <input id="range-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} className="field h-10 w-auto" />
            </div>
            <div>
              <label htmlFor="range-end" className="label">End</label>
              <input id="range-end" type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="field h-10 w-auto" />
            </div>
          </>
        )}
        {data && (
          <p className="ml-auto text-[11.5px] text-muted-foreground">
            {formatDate(data.range.start)} – {formatDate(data.range.end)} · {data.range.days} days
          </p>
        )}
      </div>

      {overview.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-lg" />)}
        </div>
      ) : preset === "custom" && (!start || !end) ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          Choose a start and end date to see this range.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Books finished"
              value={formatNumber(totals?.books_completed)}
              icon={BookCheck}
              trend={previous ? { value: change(totals?.books_completed ?? 0, previous.books_completed), label: "vs previous period" } : undefined}
            />
            <StatCard
              label="Pages read"
              value={formatNumber(totals?.pages)}
              icon={BookOpen}
              trend={previous ? { value: change(totals?.pages ?? 0, previous.pages), label: "vs previous period" } : undefined}
            />
            <StatCard
              label="Time reading"
              value={formatMinutes(totals?.minutes)}
              icon={Clock3}
              trend={previous ? { value: change(totals?.minutes ?? 0, previous.minutes), label: "vs previous period" } : undefined}
            />
            <StatCard
              label="Sessions"
              value={formatNumber(totals?.sessions)}
              icon={Layers}
              hint={`${activeDays} active ${activeDays === 1 ? "day" : "days"}`}
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Daily pages</CardTitle>
                <p className="text-[12px] text-muted-foreground">Pages read per day across the selected range.</p>
              </CardHeader>
              <CardContent className="pt-3">
                {data?.daily.some((day) => day.pages > 0) ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <AreaChart data={data.daily} margin={{ left: -18, right: 6, top: 6 }}>
                      <defs>
                        <linearGradient id="pagesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c25a32" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="#c25a32" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.18)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(value: string) => formatDate(value, { day: "numeric", month: "short" })} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(value) => formatDate(String(value))}
                        formatter={(value: number) => [`${value} pages`, "Pages"]}
                        contentStyle={{ background: "#1c1917", color: "#f4ede4", border: "none", borderRadius: 8, fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="pages" stroke="#c25a32" strokeWidth={2} fill="url(#pagesFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Minutes read</CardTitle>
                <p className="text-[12px] text-muted-foreground">Focused time only; pauses are excluded.</p>
              </CardHeader>
              <CardContent className="pt-3">
                {data?.daily.some((day) => day.minutes > 0) ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={data.daily} margin={{ left: -18, right: 6, top: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.18)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(value: string) => formatDate(value, { day: "numeric", month: "short" })} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        labelFormatter={(value) => formatDate(String(value))}
                        formatter={(value: number) => [`${Math.round(value)} min`, "Time"]}
                        contentStyle={{ background: "#1c1917", color: "#f4ede4", border: "none", borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey="minutes" fill="#5f7f68" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ChartEmpty />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Genres</CardTitle>
                <p className="text-[12px] text-muted-foreground">Books finished in the range, by genre.</p>
              </CardHeader>
              <CardContent className="pt-3">
                {data?.genres.length ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie data={data.genres} dataKey="count" nameKey="genre" innerRadius={48} outerRadius={78} paddingAngle={2}>
                          {data.genres.map((entry, index) => (
                            <Cell key={entry.genre} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [`${value} books`, name]}
                          contentStyle={{ background: "#1c1917", color: "#f4ede4", border: "none", borderRadius: 8, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <ChartEmpty />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Ratings by genre</CardTitle>
                <p className="text-[12px] text-muted-foreground">Your average rating for finished books.</p>
              </CardHeader>
              <CardContent className="pt-3">
                {data?.ratings_by_genre.length ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={data.ratings_by_genre.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.18)" horizontal={false} />
                      <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="genre" width={90} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value: number) => [`${value} / 5`, "Average"]}
                        contentStyle={{ background: "#1c1917", color: "#f4ede4", border: "none", borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey="average" fill="#c9a227" radius={[0, 3, 3, 0]} maxBarSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-12 text-center text-[12.5px] text-muted-foreground">Rate finished books to see this breakdown.</p>
                )}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-1">
              <div>
                <CardTitle className="text-base">Reading heatmap</CardTitle>
                <p className="mt-1 text-[12px] text-muted-foreground">Click any day to see the sessions behind it.</p>
              </div>
              <div className="flex items-center gap-2">
                <Tabs
                  tabs={[
                    { value: "pages", label: "Pages" },
                    { value: "minutes", label: "Minutes" },
                    { value: "sessions", label: "Sessions" },
                  ]}
                  value={metric}
                  onChange={setMetric}
                />
                <Select
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  className="h-8 w-auto text-[12px]"
                  aria-label="Heatmap year"
                >
                  {Array.from({ length: 5 }).map((_, index) => {
                    const value = new Date().getFullYear() - index;
                    return <option key={value} value={value}>{value}</option>;
                  })}
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {heatmap.isLoading ? (
                <Skeleton className="h-36" />
              ) : heatmap.data ? (
                <ReadingHeatmap data={heatmap.data} metricLabel={metric} selectedDay={selectedDay ?? undefined} onSelectDay={setSelectedDay} />
              ) : null}
            </CardContent>
          </Card>

          <section className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <Flame className="h-3.5 w-3.5" /> Current streak
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">{summary.data?.current_streak ?? 0} days</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" /> Avg per active day
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">
                  {activeDays ? formatMinutes(Math.round((totals?.minutes ?? 0) / activeDays)) : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" /> Pages per hour
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">
                  {totals?.minutes ? Math.round(((totals.pages ?? 0) / totals.minutes) * 60) : "—"}
                </p>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <Dialog
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatDate(selectedDay, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Day detail"}
        description="Sessions recorded on this day."
        size="md"
        footer={<Button variant="outline" onClick={() => setSelectedDay(null)}>Close</Button>}
      >
        {dayDetail.isLoading ? (
          <Skeleton className="h-24" />
        ) : dayDetail.data?.sessions.length ? (
          <div className="space-y-2">
            {dayDetail.data.sessions.map((session) => (
              <div key={session.id} className="rounded-md border border-border/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">{session.book_title}</p>
                  <span className="text-[11.5px] tabular-nums text-muted-foreground">{session.duration_minutes} min</span>
                </div>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {session.pages_read ? `${session.pages_read} pages · ` : ""}
                  {session.source === "timer" ? "Timer" : "Manual"}
                </p>
                {session.notes && <p className="mt-1.5 text-[12px] leading-5 text-foreground/80">{session.notes}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-[13px] text-muted-foreground">No sessions on this day.</p>
        )}
      </Dialog>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-[210px] items-center justify-center rounded-md border border-dashed border-border/70 text-center">
      <p className="max-w-[220px] text-[12px] leading-5 text-muted-foreground">
        <EmptyStateIcon />
        No sessions in this range yet.
      </p>
    </div>
  );
}

function EmptyStateIcon() {
  return <BookOpen className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground/50" />;
}
