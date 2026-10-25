import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BookMarked, BookOpen, CalendarDays, Clock3, Flame, LibraryBig,
  NotebookPen, Plus, Sparkles, Target,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/auth";
import { formatDate, formatMinutes, formatNumber, relativeTime, todayISO } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, RadialProgress } from "@/components/ui/progress";
import { Skeleton, PageSkeleton } from "@/components/ui/skeleton";
import { BookCover } from "@/components/books/book-cover";
import { BookFormDialog } from "@/components/books/book-form-dialog";
import { SessionDialog } from "@/components/reading/session-dialog";
import { StatCard } from "@/components/analytics/stat-card";
import { ReadingHeatmap } from "@/components/analytics/heatmap";

export function DashboardPage() {
  const { user } = useAuth();
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);

  const summary = useQuery({ queryKey: ["summary"], queryFn: api.analytics.summary });
  const current = useQuery({ queryKey: ["currently-reading"], queryFn: api.analytics.currentlyReading });
  const sessions = useQuery({
    queryKey: ["sessions", "recent"],
    queryFn: () => api.sessions.list({ page_size: 5 }),
  });
  const recommendations = useQuery({
    queryKey: ["goals", "recommendations"],
    queryFn: api.goals.recommendations,
  });
  const heatmap = useQuery({
    queryKey: ["analytics", "heatmap", new Date().getFullYear(), "pages"],
    queryFn: () => api.analytics.heatmap(undefined, "pages"),
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.display_name.split(" ")[0] ?? "reader";

  if (summary.isLoading) {
    return <PageSkeleton />;
  }

  const s = summary.data;
  const goal = s?.annual_goal;
  const goalPercent = goal && goal.target_value ? ((goal.current_value ?? 0) / goal.target_value) * 100 : 0;

  return (
    <div className="space-y-7 animate-fade-in">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
        title={`${greeting}, ${firstName}.`}
        description="Here is the shape of your reading right now — time, attention, and what is waiting for you."
        actions={
          <>
            <Button variant="outline" onClick={() => setAddBookOpen(true)}>
              <Plus className="h-4 w-4" /> Add book
            </Button>
            <Button onClick={() => setSessionOpen(true)}>
              <Clock3 className="h-4 w-4" /> Log session
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Reading at a glance">
        <StatCard label="Books this year" value={s?.completed_this_year ?? 0} icon={BookMarked} hint={`of ${goal?.target_value ?? 0} goal`} />
        <StatCard label="Current streak" value={`${s?.current_streak ?? 0} ${s?.current_streak === 1 ? "day" : "days"}`} icon={Flame} hint="consecutive reading days" />
        <StatCard label="Pages all time" value={formatNumber(s?.total_pages_read)} icon={BookOpen} hint={`${s?.total_sessions ?? 0} sessions`} />
        <StatCard label="Time reading" value={formatMinutes(s?.total_minutes_read)} icon={Clock3} hint={`${s?.total_books ?? 0} books in library`} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="overflow-hidden">
          <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <RadialProgress value={goalPercent} size={132} stroke={9}>
              <span className="font-display text-2xl font-semibold tabular-nums">{Math.round(goalPercent)}%</span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">of goal</span>
            </RadialProgress>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">Annual goal</p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold leading-tight">
                {goal && goal.target_value > 0 ? goal.name : "Set an annual reading goal"}
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                {goal && goal.target_value > 0
                  ? `${goal.current_value ?? 0} of ${goal.target_value} books finished · ${goal.remaining ?? 0} to go in ${s?.year}.`
                  : "A visible target makes the year feel navigable. Choose something you can sustain."}
              </p>
              <div className="mt-4 max-w-sm">
                <Progress value={goalPercent} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/goals"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium transition-colors hover:bg-muted/60"
                >
                  {goal?.id ? "View all goals" : "Create a goal"} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Button size="sm" variant="ghost" onClick={() => setSessionOpen(true)}>Log a session</Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-1">
            <CardTitle className="text-base">Currently reading</CardTitle>
            <Link to="/reading" className="text-[12px] font-medium text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="pt-3">
            {current.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : current.data?.items.length ? (
              <ul className="space-y-1">
                {current.data.items.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    <Link to={`/books/${item.id}`} className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted/50">
                      <BookCover title={item.book.title} authors={item.book.authors} url={item.book.cover_url} className="h-14 w-10" compact />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{item.book.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {item.last_read_at ? `Read ${relativeTime(item.last_read_at)}` : "Not started yet"}
                          {item.estimated_completion_date ? ` · done ~${formatDate(item.estimated_completion_date)}` : ""}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Progress value={item.progress_percent} className="h-1" />
                          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                            {Math.round(item.progress_percent ?? 0)}%
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center">
                <LibraryBig className="mx-auto h-7 w-7 text-muted-foreground/50" />
                <p className="mt-2 text-[13px] font-medium">No book in progress</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">Start something from your library.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setAddBookOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add a book
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-1">
            <div>
              <CardTitle className="text-base">Reading rhythm</CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground">Every square is a day in {new Date().getFullYear()}.</p>
            </div>
            <Link to="/analytics" className="text-[12px] font-medium text-primary hover:underline">Analytics</Link>
          </CardHeader>
          <CardContent className="pt-4">
            {heatmap.isLoading ? (
              <Skeleton className="h-32" />
            ) : heatmap.data ? (
              <ReadingHeatmap data={heatmap.data} metricLabel="pages" />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-1">
            <CardTitle className="text-base">Recent sessions</CardTitle>
            <Link to="/reading" className="text-[12px] font-medium text-primary hover:underline">History</Link>
          </CardHeader>
          <CardContent className="pt-2">
            {sessions.isLoading ? (
              <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : sessions.data?.items.length ? (
              <ul className="divide-y divide-border/60">
                {sessions.data.items.map((session) => (
                  <li key={session.id} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-foreground/60">
                      <CalendarDays className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{session.book_title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(session.started_at, { day: "numeric", month: "short" })} · {session.duration_minutes} min
                        {session.pages_read ? ` · ${session.pages_read} pages` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-7 text-center">
                <NotebookPen className="mx-auto h-6 w-6 text-muted-foreground/50" />
                <p className="mt-2 text-[12.5px] text-muted-foreground">Your first session will appear here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" /> Goals worth setting</CardTitle>
            <p className="text-[12px] text-muted-foreground">Derived from your recorded pace over the last 90 days.</p>
          </CardHeader>
          <CardContent>
            {recommendations.isLoading ? (
              <Skeleton className="h-24" />
            ) : recommendations.data?.items.length ? (
              <ul className="space-y-2.5">
                {recommendations.data.items.slice(0, 2).map((rec) => (
                  <li key={rec.id} className="rounded-md border border-border/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold">{rec.name}</p>
                        <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">{rec.rationale}</p>
                      </div>
                      <Link to="/goals" className="shrink-0 text-[11.5px] font-medium text-primary hover:underline">Set goal</Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-[12.5px] text-muted-foreground">Log a few sessions to unlock pace-based suggestions.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Link to="/notes" className="surface group flex items-center gap-4 p-5 transition-colors hover:border-primary/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"><NotebookPen className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="text-[13px] font-semibold">Capture an idea</p>
              <p className="text-[11.5px] text-muted-foreground">Notes, highlights and searchable knowledge.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link to="/assistant" className="surface group flex items-center gap-4 p-5 transition-colors hover:border-primary/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent"><Sparkles className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="text-[13px] font-semibold">Ask your library</p>
              <p className="text-[11.5px] text-muted-foreground">Grounded answers from your notes, with sources.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-md border border-dashed border-border px-4 py-3 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Today is {formatDate(todayISO())}</span>
        <Link to="/settings" className="font-medium text-foreground/70 hover:text-foreground">Export your data</Link>
      </div>

      <BookFormDialog open={addBookOpen} onClose={() => setAddBookOpen(false)} />
      <SessionDialog open={sessionOpen} onClose={() => setSessionOpen(false)} />
    </div>
  );
}
