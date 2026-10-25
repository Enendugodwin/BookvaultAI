import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck, CalendarDays, CheckCircle2, Clock3, Pencil, Star, Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { ReadingSession, UserBook } from "@/lib/types";
import { cn, formatDate, formatDateTime, formatMinutes, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { BookCover } from "@/components/books/book-cover";
import { SessionDialog } from "@/components/reading/session-dialog";
import { SessionEditDialog } from "@/components/reading/session-edit-dialog";
import { TimerWidget } from "@/components/reading/timer-widget";

export function ReadingPage() {
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionBook, setSessionBook] = useState<UserBook | undefined>();
  const [completeBook, setCompleteBook] = useState<UserBook | null>(null);
  const [editSession, setEditSession] = useState<ReadingSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<ReadingSession | null>(null);
  const [page, setPage] = useState(1);

  const books = useQuery({
    queryKey: ["books", "reading-list"],
    queryFn: () => api.books.list({ status: "reading,rereading", page_size: 50, sort: "updated", order: "desc" }),
  });

  const current = useQuery({ queryKey: ["currently-reading"], queryFn: api.analytics.currentlyReading });

  const sessions = useQuery({
    queryKey: ["sessions", page],
    queryFn: () => api.sessions.list({ page, page_size: 12 }),
    placeholderData: keepPreviousData,
  });

  const currentById = new Map(current.data?.items.map((item) => [item.id, item]) ?? []);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="In progress"
        title="Currently reading"
        description="Start a focus timer, update your page, and keep the thread of each book alive."
        actions={
          <Button
            onClick={() => {
              setSessionBook(undefined);
              setSessionOpen(true);
            }}
          >
            <Clock3 className="h-4 w-4" /> Log session
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <TimerWidget books={books.data?.items} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">This week at a glance</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <Skeleton className="h-24" />
            ) : sessions.data?.items.length ? (
              <WeekSummary sessions={sessions.data.items.slice(0, 7)} />
            ) : (
              <p className="py-4 text-[13px] text-muted-foreground">Log your first session to see the week take shape.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Open books</h2>
          <span className="text-[12px] text-muted-foreground">{books.data?.total ?? 0} in progress</span>
        </div>

        {books.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-44 rounded-lg" />
            <Skeleton className="h-44 rounded-lg" />
          </div>
        ) : books.data?.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {books.data.items.map((book) => (
              <CurrentBookCard
                key={book.id}
                book={book}
                lastRead={currentById.get(book.id)?.last_read_at ?? null}
                onSession={() => {
                  setSessionBook(book);
                  setSessionOpen(true);
                }}
                onComplete={() => setCompleteBook(book)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpenCheck}
            title="Nothing in progress"
            description="Pick a book from your library and mark it as reading to see it here."
          />
        )}
        {!books.isLoading && !books.data?.items.length && (
          <div className="text-center">
            <Link to="/library" className="text-[12.5px] font-medium text-primary hover:underline">Browse your library →</Link>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Session history</h2>
          <span className="text-[12px] text-muted-foreground">{sessions.data?.total ?? 0} sessions</span>
        </div>

        {sessions.isLoading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : sessions.data?.items.length ? (
          <>
            {/* Mobile: stacked cards avoid a horizontally clipped table. */}
            <div className="space-y-3 sm:hidden">
              {sessions.data.items.map((session) => (
                <div key={session.id} className="surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/books/${session.user_book_id}`} className="line-clamp-2 text-[13.5px] font-semibold hover:text-primary">
                        {session.book_title}
                      </Link>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDate(session.started_at)} · {session.duration_minutes} min
                        {session.pages_read ? ` · ${session.pages_read} pages` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => setEditSession(session)} aria-label="Edit session">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteSession(session)} aria-label="Delete session">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {session.notes && (
                    <p className="mt-2 line-clamp-2 border-t border-border/60 pt-2 text-[11.5px] leading-5 text-muted-foreground">
                      {session.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-border/80 bg-card shadow-soft sm:block">
            <div className="overflow-x-auto">
              <table className="table-base min-w-[680px]">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Date</th>
                    <th>Duration</th>
                    <th>Pages</th>
                    <th>Notes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.data.items.map((session) => (
                    <tr key={session.id} className="transition-colors hover:bg-muted/30">
                      <td>
                        <Link to={`/books/${session.user_book_id}`} className="text-[12.5px] font-medium hover:text-primary">
                          {session.book_title}
                        </Link>
                      </td>
                      <td className="text-[11.5px] text-muted-foreground">{formatDate(session.started_at)}</td>
                      <td className="text-[12px] tabular-nums">{session.duration_minutes} min</td>
                      <td className="text-[12px] tabular-nums">
                        {session.pages_read ?? "—"}
                        {session.pages_per_hour ? <span className="ml-1 text-[10.5px] text-muted-foreground">({session.pages_per_hour}/h)</span> : null}
                      </td>
                      <td className="max-w-[220px] truncate text-[11.5px] text-muted-foreground">{session.notes || "—"}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditSession(session)} aria-label="Edit session">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteSession(session)} aria-label="Delete session">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No sessions yet"
            description="Use the timer or log a session manually. Every minute you record sharpens your analytics."
            action={<Button onClick={() => setSessionOpen(true)}><Clock3 className="h-4 w-4" /> Log your first session</Button>}
          />
        )}

        {(sessions.data?.pages ?? 1) > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</Button>
            <span className="text-[12px] text-muted-foreground">{page} / {sessions.data?.pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(sessions.data?.pages ?? 1, value + 1))} disabled={page === (sessions.data?.pages ?? 1)}>Next</Button>
          </div>
        )}
      </section>

      <SessionDialog open={sessionOpen} onClose={() => setSessionOpen(false)} books={books.data?.items} defaultBook={sessionBook} />
      <CompleteBookDialog book={completeBook} onClose={() => setCompleteBook(null)} />
      <SessionEditDialog session={editSession} onClose={() => setEditSession(null)} />
      <DeleteSessionDialog session={deleteSession} onClose={() => setDeleteSession(null)} />
    </div>
  );
}

function WeekSummary({ sessions }: { sessions: ReadingSession[] }) {
  const totalMinutes = sessions.reduce((sum, session) => sum + session.duration_minutes, 0);
  const totalPages = sessions.reduce((sum, session) => sum + (session.pages_read ?? 0), 0);
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <p className="font-display text-2xl font-semibold">{sessions.length}</p>
        <p className="text-[11px] text-muted-foreground">recent sessions</p>
      </div>
      <div>
        <p className="font-display text-2xl font-semibold">{formatMinutes(totalMinutes)}</p>
        <p className="text-[11px] text-muted-foreground">time reading</p>
      </div>
      <div>
        <p className="font-display text-2xl font-semibold">{totalPages}</p>
        <p className="text-[11px] text-muted-foreground">pages turned</p>
      </div>
    </div>
  );
}

function CurrentBookCard({
  book,
  lastRead,
  onSession,
  onComplete,
}: {
  book: UserBook;
  lastRead: string | null;
  onSession: () => void;
  onComplete: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pageValue, setPageValue] = useState(book.current_page !== null ? String(book.current_page) : "");

  const update = useMutation({
    mutationFn: () => api.books.progress(book.id, Number(pageValue)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast.success("Progress updated");
    },
    onError: (err) => toast.error("Could not update progress", err instanceof ApiError ? err.message : undefined),
  });

  return (
    <div className="surface flex gap-4 p-4">
      <Link to={`/books/${book.id}`} className="shrink-0">
        <BookCover title={book.book.title} authors={book.book.authors} url={book.book.cover_url} className="h-[132px] w-[88px]" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/books/${book.id}`} className="line-clamp-2 font-display text-[16px] font-semibold leading-snug hover:text-primary">
              {book.book.title}
            </Link>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{book.book.authors.join(", ") || "Unknown author"}</p>
          </div>
          <Badge className="shrink-0 bg-primary/10 text-primary">{book.status === "rereading" ? "Rereading" : "Reading"}</Badge>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {lastRead ? `Last read ${relativeTime(lastRead)}` : "Not started"}
          {book.started_at ? ` · started ${formatDate(book.started_at)}` : ""}
        </p>

        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
            <span>{book.current_page ?? 0}{book.book.page_count ? ` / ${book.book.page_count}` : ""} pages</span>
            <span className="tabular-nums">{Math.round(book.progress_percent ?? 0)}%</span>
          </div>
          <Progress value={book.progress_percent} className="h-1.5" />
        </div>

        <div className="mt-auto flex flex-wrap items-end gap-1.5 pt-3">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={book.book.page_count ?? undefined}
              value={pageValue}
              onChange={(event) => setPageValue(event.target.value)}
              className="h-8 w-20 text-[12px]"
              aria-label={`Current page for ${book.book.title}`}
            />
            <Button variant="outline" size="sm" onClick={() => update.mutate()} loading={update.isPending} disabled={!pageValue}>
              Update
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onSession}><Clock3 className="h-3.5 w-3.5" /> Session</Button>
          <Button variant="ghost" size="sm" onClick={onComplete}><CheckCircle2 className="h-3.5 w-3.5" /> Finish</Button>
        </div>
      </div>
    </div>
  );
}

function CompleteBookDialog({ book, onClose }: { book: UserBook | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");

  const complete = useMutation({
    mutationFn: () => api.books.complete(book!.id, { rating: rating ?? undefined, review: review.trim() || undefined }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success(
        "Book finished",
        result.suggested_next ? `Next up: ${result.suggested_next.book.title}` : "A fine addition to the finished shelf.",
      );
      setRating(null);
      setReview("");
      onClose();
    },
    onError: (err) => toast.error("Could not finish this book", err instanceof ApiError ? err.message : undefined),
  });

  return (
    <Dialog
      open={Boolean(book)}
      onClose={onClose}
      title="Finish this book"
      description={book ? `${book.book.title} will move to your completed shelf.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={complete.isPending}>Cancel</Button>
          <Button onClick={() => complete.mutate()} loading={complete.isPending}>Mark finished</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>How was it?</Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value === rating ? null : value)}
                aria-label={`Rate ${value} out of 5`}
                aria-pressed={rating === value}
                className="p-0.5"
              >
                <Star className={cn("h-6 w-6 transition-colors", rating && value <= rating ? "fill-warning text-warning" : "text-muted-foreground/40")} />
              </button>
            ))}
            {rating && <span className="ml-1 text-[12px] text-muted-foreground">{rating} / 5</span>}
          </div>
        </div>
        <div>
          <Label htmlFor="complete-review">A short review</Label>
          <Textarea id="complete-review" rows={3} value={review} onChange={(event) => setReview(event.target.value)} placeholder="What will you carry forward?" />
        </div>
        <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Clock3 className="h-3 w-3" /> Sessions and notes stay attached to this book.
        </p>
      </div>
    </Dialog>
  );
}

function DeleteSessionDialog({ session, onClose }: { session: ReadingSession | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: () => api.sessions.remove(session!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast.success("Session deleted");
      onClose();
    },
    onError: (err) => toast.error("Could not delete session", err instanceof ApiError ? err.message : undefined),
  });

  return (
    <ConfirmDialog
      open={Boolean(session)}
      title="Delete this session?"
      description={session ? `${session.book_title} · ${formatDateTime(session.started_at)} · ${session.duration_minutes} minutes` : ""}
      confirmLabel="Delete session"
      destructive
      loading={remove.isPending}
      onConfirm={() => remove.mutate()}
      onClose={onClose}
    />
  );
}
