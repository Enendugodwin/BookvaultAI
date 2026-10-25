import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { UserBook } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SessionDialog({
  open,
  onClose,
  books,
  defaultBook,
}: {
  open: boolean;
  onClose: () => void;
  books?: UserBook[];
  defaultBook?: UserBook;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [bookId, setBookId] = useState(defaultBook?.id ?? "");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [paused, setPaused] = useState("0");
  const [startPage, setStartPage] = useState("");
  const [endPage, setEndPage] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const library = useQuery({
    queryKey: ["books", "session-picker"],
    queryFn: () => api.books.list({ page_size: 100, sort: "updated", order: "desc" }),
    enabled: open && !books && !defaultBook,
  });

  const options = books ?? library.data?.items ?? (defaultBook ? [defaultBook] : []);
  const selected = options.find((book) => book.id === bookId) ?? defaultBook;

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setBookId(defaultBook?.id ?? books?.[0]?.id ?? "");
    setStartedAt(toLocalInput(new Date(now.getTime() - 30 * 60_000)));
    setEndedAt(toLocalInput(now));
    setPaused("0");
    setStartPage(defaultBook?.current_page ? String(defaultBook.current_page) : "");
    setEndPage("");
    setNotes("");
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
  }, [open, defaultBook, books]);

  useEffect(() => {
    if (!bookId && options.length && !defaultBook) setBookId(options[0].id);
  }, [bookId, options, defaultBook]);

  const preview = useMemo(() => {
    if (!startedAt || !endedAt) return null;
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000) - Number(paused || 0) * 60);
    const pages = startPage && endPage ? Math.max(0, Number(endPage) - Number(startPage)) : null;
    return { minutes: Math.round(seconds / 60), pages };
  }, [startedAt, endedAt, paused, startPage, endPage]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!bookId) throw new ApiError(400, "missing_book", "Choose a book for this session.");
      return api.sessions.create(
        bookId,
        {
          started_at: new Date(startedAt).toISOString(),
          ended_at: new Date(endedAt).toISOString(),
          paused_seconds: Math.max(0, Number(paused || 0) * 60),
          start_page: startPage ? Number(startPage) : null,
          end_page: endPage ? Number(endPage) : null,
          notes: notes.trim() || null,
        },
        idempotencyKey,
      );
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      void queryClient.invalidateQueries({ queryKey: ["timer"] });
      toast.success("Session logged", `${session.duration_minutes} min · ${session.pages_read ?? 0} pages`);
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not log this session."),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Log a reading session"
      description="Record focused reading time. Pauses are excluded from your reading minutes."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!bookId || !startedAt || !endedAt}>
            Save session
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}
        <div>
          <Label htmlFor="session-book">Book</Label>
          <Select id="session-book" value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">Choose a book…</option>
            {options.map((book) => (
              <option key={book.id} value={book.id}>{book.book.title}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="started-at">Started</Label>
            <Input id="started-at" type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ended-at">Ended</Label>
            <Input id="ended-at" type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="paused">Paused (min)</Label>
            <Input id="paused" type="number" min={0} value={paused} onChange={(e) => setPaused(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="start-page">Start page</Label>
            <Input id="start-page" type="number" min={0} value={startPage} onChange={(e) => setStartPage(e.target.value)} placeholder={selected?.current_page ? String(selected.current_page) : "0"} />
          </div>
          <div>
            <Label htmlFor="end-page">End page</Label>
            <Input id="end-page" type="number" min={0} value={endPage} onChange={(e) => setEndPage(e.target.value)} placeholder={selected?.book.page_count ? String(selected.book.page_count) : "—"} />
          </div>
        </div>
        {preview && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
            This records <strong className="text-foreground">{preview.minutes} focused minutes</strong>
            {preview.pages !== null ? <> and <strong className="text-foreground">{preview.pages} pages</strong></> : null}.
          </p>
        )}
        <div>
          <Label htmlFor="session-notes">Session note</Label>
          <Textarea id="session-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where your attention went, what surprised you…" />
        </div>
      </form>
    </Dialog>
  );
}
