import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Square, TimerReset, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { UserBook } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TimerWidget({
  books,
  defaultBookId,
  className,
  compact = false,
}: {
  books?: UserBook[];
  defaultBookId?: string;
  className?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedBook, setSelectedBook] = useState(defaultBookId ?? "");
  const [now, setNow] = useState(() => Date.now());
  const [stopOpen, setStopOpen] = useState(false);
  const [endPage, setEndPage] = useState("");
  const [stopNotes, setStopNotes] = useState("");

  const timerQuery = useQuery({
    queryKey: ["timer"],
    queryFn: api.timer.get,
    refetchInterval: 30_000,
  });

  const timer = timerQuery.data?.timer ?? null;

  useEffect(() => {
    if (!timer?.running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer?.running, timer?.id]);

  useEffect(() => {
    if (defaultBookId) setSelectedBook(defaultBookId);
  }, [defaultBookId]);

  const elapsed = useMemo(() => {
    if (!timer) return 0;
    if (!timer.running) return timer.elapsed_seconds;
    const fetchedAt = new Date(timerQuery.dataUpdatedAt).getTime();
    return timer.elapsed_seconds + Math.max(0, Math.floor((now - fetchedAt) / 1000));
  }, [timer, now, timerQuery.dataUpdatedAt]);

  const start = useMutation({
    mutationFn: () => api.timer.start(selectedBook),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["timer"] });
      toast.success("Timer started", "Your session is recording.");
    },
    onError: (err) => toast.error("Could not start timer", err instanceof ApiError ? err.message : undefined),
  });

  const toggle = useMutation({
    mutationFn: () => (timer?.running ? api.timer.pause() : api.timer.resume()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["timer"] }),
    onError: (err) => toast.error("Timer update failed", err instanceof ApiError ? err.message : undefined),
  });

  const cancel = useMutation({
    mutationFn: () => api.timer.cancel(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["timer"] });
      toast.toast("Timer discarded");
    },
  });

  const stop = useMutation({
    mutationFn: () =>
      api.timer.stop({
        end_page: endPage ? Number(endPage) : null,
        notes: stopNotes.trim() || undefined,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["timer"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      toast.success("Session saved", `${result.session.duration_minutes} focused minutes recorded`);
      setStopOpen(false);
      setEndPage("");
      setStopNotes("");
    },
    onError: (err) => toast.error("Could not save session", err instanceof ApiError ? err.message : undefined),
  });

  return (
    <div className={cn("surface overflow-hidden", className)}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {timer?.running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", timer ? (timer.running ? "bg-primary" : "bg-warning") : "bg-muted-foreground/40")} />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {timer ? (timer.running ? "Timer running" : "Timer paused") : "Focus timer"}
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[2.35rem] font-medium leading-none tracking-tight tabular-nums">
              {formatClock(elapsed)}
            </p>
            <p className="mt-1.5 line-clamp-1 text-[12.5px] text-muted-foreground">
              {timer?.book_title ?? (compact ? "Start a focused reading session." : "Choose a book and start a focused session.")}
            </p>
          </div>
          {timer && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => toggle.mutate()} loading={toggle.isPending}>
                {timer.running ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
              </Button>
              <Button size="sm" onClick={() => setStopOpen(true)}>
                <Square className="h-3.5 w-3.5" /> Finish
              </Button>
              <Button variant="ghost" size="icon" onClick={() => cancel.mutate()} aria-label="Discard timer">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {!timer && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            {books && books.length > 0 && !defaultBookId && (
              <div className="flex-1">
                <Label htmlFor="timer-book" className="sr-only">Book</Label>
                <Select id="timer-book" value={selectedBook} onChange={(event) => setSelectedBook(event.target.value)}>
                  <option value="">Choose a book…</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>{book.book.title}</option>
                  ))}
                </Select>
              </div>
            )}
            <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!selectedBook}>
              <Play className="h-4 w-4" /> Start timer
            </Button>
          </div>
        )}

        {!timer && !selectedBook && !books && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <TimerReset className="h-3.5 w-3.5" /> Open a book to start timing from your current page.
          </p>
        )}
      </div>

      <Dialog
        open={stopOpen}
        onClose={() => setStopOpen(false)}
        title="Finish this session"
        description="We will save the elapsed time as a reading session."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStopOpen(false)} disabled={stop.isPending}>Keep going</Button>
            <Button onClick={() => stop.mutate()} loading={stop.isPending}>Save session</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            Recorded time: <strong className="font-mono">{formatClock(elapsed)}</strong>
          </p>
          <div>
            <Label htmlFor="timer-end-page">End page</Label>
            <Input id="timer-end-page" type="number" min={0} value={endPage} onChange={(event) => setEndPage(event.target.value)} placeholder="Where you stopped" />
          </div>
          <div>
            <Label htmlFor="timer-notes">Session note</Label>
            <Input id="timer-notes" value={stopNotes} onChange={(event) => setStopNotes(event.target.value)} placeholder="Optional" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
