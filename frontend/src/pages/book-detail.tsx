import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, BookOpen, CalendarClock, Clock3, Highlighter,
  Loader2, NotebookPen, Pencil, Plus, Sparkles, Star, Trash2, UserRound,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { BookStatus, Highlight, Note, ReadingSession, UserBook } from "@/lib/types";
import {
  cn, formatDate, formatDateTime, formatMinutes, formatNumber, statusLabel, statusTone,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { BookCover } from "@/components/books/book-cover";
import { BookFormDialog } from "@/components/books/book-form-dialog";
import { SessionDialog } from "@/components/reading/session-dialog";
import { SessionEditDialog } from "@/components/reading/session-edit-dialog";
import { NoteDialog } from "@/components/knowledge/note-dialog";
import { HighlightDialog } from "@/components/knowledge/highlight-dialog";

type DetailTab = "overview" | "sessions" | "notes" | "highlights";

export function BookDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ReadingSession | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<Note | null>(null);
  const [deleteHighlightTarget, setDeleteHighlightTarget] = useState<Highlight | null>(null);
  const [pageValue, setPageValue] = useState<string>("");

  const bookQuery = useQuery({
    queryKey: ["book", id],
    queryFn: () => api.books.get(id),
    enabled: Boolean(id),
  });

  const sessions = useQuery({
    queryKey: ["sessions", "book", id],
    queryFn: () => api.sessions.list({ user_book_id: id, page_size: 50 }),
    enabled: Boolean(id),
  });

  const notes = useQuery({
    queryKey: ["notes", "book", id],
    queryFn: () => api.notes.list({ user_book_id: id, page_size: 100 }),
    enabled: Boolean(id),
  });

  const highlights = useQuery({
    queryKey: ["highlights", "book", id],
    queryFn: () => api.highlights.list({ user_book_id: id }),
    enabled: Boolean(id),
  });

  const summaries = useQuery({
    queryKey: ["ai", "summaries", id],
    queryFn: () => api.ai.summaries(id),
    enabled: Boolean(id),
  });

  const aiStatus = useQuery({ queryKey: ["ai", "status"], queryFn: api.ai.status });

  const book = bookQuery.data;

  const updateStatus = useMutation({
    mutationFn: (status: BookStatus) => api.books.update(id, { status }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["book", id], (current: UserBook | undefined) =>
        current ? { ...current, ...updated, stats: current.stats } : updated,
      );
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      toast.success(`Moved to ${statusLabel(updated.status)}`);
    },
    onError: (err) => toast.error("Could not change the shelf", err instanceof ApiError ? err.message : undefined),
  });

  const updateProgress = useMutation({
    mutationFn: () => api.books.progress(id, Number(pageValue)),
    onSuccess: (updated) => {
      queryClient.setQueryData(["book", id], (current: UserBook | undefined) =>
        current ? { ...current, ...updated, stats: current.stats } : updated,
      );
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Progress saved");
    },
    onError: (err) => toast.error("Could not update progress", err instanceof ApiError ? err.message : undefined),
  });

  const removeBook = useMutation({
    mutationFn: () => api.books.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      toast.success("Book removed");
      navigate("/library");
    },
    onError: (err) => toast.error("Could not remove this book", err instanceof ApiError ? err.message : undefined),
  });

  const deleteNote = useMutation({
    mutationFn: () => api.notes.remove(deleteNoteTarget!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Note deleted");
      setDeleteNoteTarget(null);
    },
  });

  const deleteHighlight = useMutation({
    mutationFn: () => api.highlights.remove(deleteHighlightTarget!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["highlights"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Highlight deleted");
      setDeleteHighlightTarget(null);
    },
  });

  const tabs = useMemo(
    () => [
      { value: "overview" as const, label: "Overview" },
      { value: "sessions" as const, label: "Sessions", count: sessions.data?.total ?? 0 },
      { value: "notes" as const, label: "Notes", count: notes.data?.total ?? 0 },
      { value: "highlights" as const, label: "Highlights", count: highlights.data?.total ?? 0 },
    ],
    [sessions.data?.total, notes.data?.total, highlights.data?.total],
  );

  if (bookQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-24" />
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <div className="space-y-3">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (bookQuery.isError || !book) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Book not found"
        description="It may have been removed from your library, or the link is no longer valid."
        action={<Link to="/library" className="text-[13px] font-medium text-primary hover:underline">Back to library</Link>}
      />
    );
  }

  const meta = book.book;
  const currentPage = pageValue || (book.current_page !== null ? String(book.current_page) : "");
  const aiReady = Boolean(aiStatus.data?.enabled && aiStatus.data?.remaining_today !== 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/library" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Library
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5 text-destructive" /> Remove</Button>
          <Button variant="outline" size="sm" onClick={() => setSessionOpen(true)}><Clock3 className="h-3.5 w-3.5" /> Log session</Button>
        </div>
      </div>

      <section className="grid gap-6 md:grid-cols-[200px_1fr] lg:grid-cols-[220px_1fr]">
        <div>
          <BookCover title={meta.title} authors={meta.authors} url={meta.cover_url} className="aspect-[2/3] w-full" />
          <div className="mt-4 space-y-2">
            <Label htmlFor="book-status" className="mb-0">Shelf</Label>
            <Select
              id="book-status"
              value={book.status}
              onChange={(event) => updateStatus.mutate(event.target.value as BookStatus)}
              disabled={updateStatus.isPending}
            >
              <option value="want_to_read">Want to read</option>
              <option value="reading">Reading</option>
              <option value="rereading">Rereading</option>
              <option value="completed">Completed</option>
              <option value="paused">Paused</option>
              <option value="abandoned">Abandoned</option>
            </Select>
          </div>
          {book.rating ? (
            <div className="mt-3 flex items-center gap-1 text-[12.5px]">
              <Star className="h-3.5 w-3.5 fill-warning text-warning" />
              <span className="font-medium">{book.rating.toFixed(1)}</span>
              <span className="text-muted-foreground">/ 5</span>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-balance font-display text-[2.15rem] font-semibold leading-[1.1]">{meta.title}</h1>
              {meta.subtitle && <p className="mt-1.5 font-display text-lg text-muted-foreground">{meta.subtitle}</p>}
              <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-foreground/75">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                {meta.authors.length ? meta.authors.join(", ") : "Unknown author"}
              </p>
            </div>
            <Badge className={cn("px-2.5 py-1 text-[11.5px]", statusTone(book.status))}>{statusLabel(book.status)}</Badge>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {meta.categories.map((category) => (
              <Badge key={category}>{category}</Badge>
            ))}
            {book.tags.map((tag) => (
              <Badge key={tag} className="bg-accent/10 text-accent">#{tag}</Badge>
            ))}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-3">
            {[
              ["Publisher", meta.publisher],
              ["Published", meta.published_date],
              ["Pages", meta.page_count ? formatNumber(meta.page_count) : null],
              ["Language", meta.language],
              ["ISBN", meta.isbn13 ?? meta.isbn10],
              ["Added", formatDate(book.created_at)],
            ].filter(([, value]) => value).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 rounded-md border border-border/80 bg-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Progress</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {Math.round(book.progress_percent ?? 0)}%
                  <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                    {book.current_page ?? 0}{meta.page_count ? ` of ${meta.page_count}` : ""} pages
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={meta.page_count ?? undefined}
                  value={currentPage}
                  onChange={(event) => setPageValue(event.target.value)}
                  className="h-8 w-20 text-[12px]"
                  aria-label="Current page"
                />
                <Button size="sm" variant="outline" onClick={() => updateProgress.mutate()} loading={updateProgress.isPending}>
                  Save page
                </Button>
              </div>
            </div>
            <Progress value={book.progress_percent} className="mt-3 h-1.5" />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Sessions", value: formatNumber(book.stats?.sessions ?? 0), icon: Clock3 },
                { label: "Time", value: formatMinutes(book.stats?.minutes ?? 0), icon: CalendarClock },
                { label: "Notes", value: formatNumber(book.stats?.notes ?? 0), icon: NotebookPen },
                { label: "Highlights", value: formatNumber(book.stats?.highlights ?? 0), icon: Highlighter },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2 rounded-sm bg-muted/40 px-2 py-1.5">
                  <stat.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-[12px] font-semibold leading-none">{stat.value}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="w-fit" />

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader><CardTitle className="text-base">About this book</CardTitle></CardHeader>
            <CardContent>
              {meta.description ? (
                <p className="prose-reading whitespace-pre-line">{meta.description}</p>
              ) : (
                <p className="text-[13px] text-muted-foreground">No description yet. Add one from the edit dialog.</p>
              )}
              {book.review && (
                <div className="mt-5 rounded-md border-l-2 border-primary bg-muted/30 px-4 py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your review</p>
                  <p className="mt-1.5 text-[13.5px] leading-6">{book.review}</p>
                </div>
              )}
              {book.started_at || book.completed_at ? (
                <div className="mt-5 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
                  {book.started_at && <span>Started {formatDate(book.started_at)}</span>}
                  {book.completed_at && <span>Finished {formatDate(book.completed_at)}</span>}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> AI study notes</CardTitle>
            </CardHeader>
            <CardContent>
              {!aiStatus.data?.enabled ? (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-[12.5px] font-medium">AI is not available</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">{aiStatus.data?.message ?? "Enable AI and external processing consent in Settings."}</p>
                  <Link to="/settings" className="mt-2 inline-block text-[11.5px] font-medium text-primary hover:underline">Open AI settings →</Link>
                </div>
              ) : (
                <SummariesPanel
                  bookId={id}
                  items={summaries.data?.items ?? []}
                  loading={summaries.isLoading}
                  ready={aiReady}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "sessions" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Reading sessions</CardTitle>
            <Button size="sm" onClick={() => setSessionOpen(true)}><Plus className="h-3.5 w-3.5" /> Log session</Button>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <Skeleton className="h-40" />
            ) : sessions.data?.items.length ? (
              <div className="overflow-x-auto">
                <table className="table-base min-w-[560px]">
                  <thead>
                    <tr><th>Date</th><th>Duration</th><th>Pages</th><th>Notes</th><th className="text-right">Edit</th></tr>
                  </thead>
                  <tbody>
                    {sessions.data.items.map((session) => (
                      <tr key={session.id}>
                        <td className="text-[12px]">{formatDateTime(session.started_at)}</td>
                        <td className="text-[12px] tabular-nums">{session.duration_minutes} min</td>
                        <td className="text-[12px] tabular-nums">{session.pages_read ?? "—"}</td>
                        <td className="max-w-[260px] truncate text-[11.5px] text-muted-foreground">{session.notes || "—"}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setEditingSession(session)} aria-label="Edit session"><Pencil className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted-foreground">No sessions for this book yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Notes</h2>
            <Button size="sm" onClick={() => { setEditingNote(null); setNoteOpen(true); }}><Plus className="h-3.5 w-3.5" /> New note</Button>
          </div>
          {notes.isLoading ? (
            <Skeleton className="h-36" />
          ) : notes.data?.items.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {notes.data.items.map((note) => (
                <div key={note.id} className="surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13.5px] font-semibold">{note.title}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                        {formatDate(note.created_at)}{note.page_ref ? ` · ${note.page_ref}` : ""}{note.is_important ? " · Important" : ""}
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingNote(note); setNoteOpen(true); }} aria-label="Edit note"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteNoteTarget(note)} aria-label="Delete note"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-6 whitespace-pre-line text-[12.5px] leading-6 text-foreground/80">{note.content}</p>
                  {note.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {note.tags.map((tag) => <Badge key={tag} className="bg-muted text-[10px]">#{tag}</Badge>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={NotebookPen} title="No notes yet" description="Write down an idea, a question, or something you want to remember." action={<Button onClick={() => setNoteOpen(true)}>Write a note</Button>} />
          )}
        </div>
      )}

      {tab === "highlights" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Highlights</h2>
            <Button size="sm" onClick={() => { setEditingHighlight(null); setHighlightOpen(true); }}><Plus className="h-3.5 w-3.5" /> New highlight</Button>
          </div>
          {highlights.isLoading ? (
            <Skeleton className="h-36" />
          ) : highlights.data?.items.length ? (
            <div className="space-y-3">
              {highlights.data.items.map((highlight) => (
                <div key={highlight.id} className="surface border-l-2 border-l-primary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <blockquote className="font-display text-[15px] leading-7 text-foreground/90">“{highlight.text}”</blockquote>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => { setEditingHighlight(highlight); setHighlightOpen(true); }} aria-label="Edit highlight"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteHighlightTarget(highlight)} aria-label="Delete highlight"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                  {highlight.commentary && (
                    <p className="mt-2 border-t border-border/60 pt-2 text-[12.5px] leading-6 text-muted-foreground">{highlight.commentary}</p>
                  )}
                  <p className="mt-2 text-[10.5px] text-muted-foreground">
                    {highlight.page_ref ? `${highlight.page_ref} · ` : ""}{formatDate(highlight.created_at)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Highlighter} title="No highlights yet" description="Save the passages you want to return to, with a note on why they matter." action={<Button onClick={() => setHighlightOpen(true)}>Save a highlight</Button>} />
          )}
        </div>
      )}

      <BookFormDialog open={editOpen} onClose={() => setEditOpen(false)} existing={book} />
      <SessionDialog open={sessionOpen} onClose={() => setSessionOpen(false)} defaultBook={book} />
      <NoteDialog open={noteOpen} onClose={() => { setNoteOpen(false); setEditingNote(null); }} note={editingNote} defaultBookId={id} />
      <HighlightDialog open={highlightOpen} onClose={() => { setHighlightOpen(false); setEditingHighlight(null); }} highlight={editingHighlight} defaultBookId={id} />
      <SessionEditDialog session={editingSession} onClose={() => setEditingSession(null)} />
      <ConfirmDialog
        open={deleteOpen}
        title="Remove this book?"
        description={`${meta.title} and its sessions, notes and highlights will be removed from your library.`}
        confirmLabel="Remove book"
        destructive
        loading={removeBook.isPending}
        onConfirm={() => removeBook.mutate()}
        onClose={() => setDeleteOpen(false)}
      />
      <ConfirmDialog
        open={Boolean(deleteNoteTarget)}
        title="Delete this note?"
        description={deleteNoteTarget?.title ?? ""}
        confirmLabel="Delete note"
        destructive
        loading={deleteNote.isPending}
        onConfirm={() => deleteNote.mutate()}
        onClose={() => setDeleteNoteTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteHighlightTarget)}
        title="Delete this highlight?"
        description="The passage and commentary will be removed."
        confirmLabel="Delete highlight"
        destructive
        loading={deleteHighlight.isPending}
        onConfirm={() => deleteHighlight.mutate()}
        onClose={() => setDeleteHighlightTarget(null)}
      />
    </div>
  );
}

function SummariesPanel({
  bookId,
  items,
  loading,
  ready,
}: {
  bookId: string;
  items: import("@/lib/types").AISummary[];
  loading: boolean;
  ready: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState("short");
  const [length, setLength] = useState("medium");
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.ai.createSummary({ user_book_id: bookId, kind, length }),
    onSuccess: async (result) => {
      setPolling(true);
      setError(null);
      try {
        for (let i = 0; i < 30; i += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          const job = await api.jobs.get(result.job_id);
          if (job.status === "completed") {
            void queryClient.invalidateQueries({ queryKey: ["ai", "summaries", bookId] });
            toast.success("Study notes ready");
            setPolling(false);
            return;
          }
          if (job.status === "failed") {
            setError(job.error ?? "AI generation failed.");
            setPolling(false);
            return;
          }
        }
        setError("Still queued. Check that the background worker is running.");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not check generation status.");
      } finally {
        setPolling(false);
      }
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start generation."),
  });

  const remove = useMutation({
    mutationFn: (summaryId: string) => api.ai.deleteSummary(summaryId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai", "summaries", bookId] }),
  });

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">{error}</div>}
      {loading ? <Skeleton className="h-24" /> : items.length ? (
        <div className="space-y-2.5">
          {items.slice(0, 2).map((summary) => (
            <div key={summary.id} className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {summary.kind} · {summary.coverage}
                </p>
                <button onClick={() => remove.mutate(summary.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete summary">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-1.5 line-clamp-[14] whitespace-pre-line text-[12.5px] leading-6 text-foreground/85">{summary.content}</p>
              {summary.coverage_note && <p className="mt-1.5 text-[10.5px] text-muted-foreground">{summary.coverage_note}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] leading-6 text-muted-foreground">
          Generate a study summary grounded in this book's metadata, your notes, highlights, and any uploaded documents.
          Coverage is stated honestly.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div>
          <Label htmlFor="summary-kind" className="text-[11px]">Kind</Label>
          <Select id="summary-kind" value={kind} onChange={(event) => setKind(event.target.value)} className="h-8 w-auto text-[12px]">
            <option value="short">Short summary</option>
            <option value="detailed">Detailed summary</option>
            <option value="key_ideas">Key ideas</option>
            <option value="main_arguments">Main arguments</option>
            <option value="takeaways">Takeaways</option>
            <option value="applications">Applications</option>
            <option value="discussion_questions">Discussion questions</option>
            <option value="revision_notes">Revision notes</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="summary-length" className="text-[11px]">Length</Label>
          <Select id="summary-length" value={length} onChange={(event) => setLength(event.target.value)} className="h-8 w-auto text-[12px]">
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </Select>
        </div>
        <Button size="sm" onClick={() => create.mutate()} loading={create.isPending || polling} disabled={!ready}>
          {polling ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Sparkles className="h-3.5 w-3.5" /> Generate</>}
        </Button>
      </div>
    </div>
  );
}
