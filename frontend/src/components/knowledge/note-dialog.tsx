import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Note, UserBook } from "@/lib/types";
import { cn, parseTags } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function NoteDialog({
  open,
  onClose,
  note,
  defaultBookId,
}: {
  open: boolean;
  onClose: () => void;
  note?: Note | null;
  defaultBookId?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(note);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [bookId, setBookId] = useState("");
  const [pageRef, setPageRef] = useState("");
  const [tags, setTags] = useState("");
  const [important, setImportant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const books = useQuery({
    queryKey: ["books", "note-picker"],
    queryFn: () => api.books.list({ page_size: 100, sort: "title", order: "asc" }),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setBookId(note?.user_book_id ?? defaultBookId ?? "");
    setPageRef(note?.page_ref ?? "");
    setTags((note?.tags ?? []).join(", "));
    setImportant(note?.is_important ?? false);
    setError(null);
  }, [open, note, defaultBookId]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        user_book_id: bookId || null,
        page_ref: pageRef.trim() || null,
        tags: parseTags(tags),
        is_important: important,
      };
      return isEdit ? api.notes.update(note!.id, payload) : api.notes.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success(isEdit ? "Note updated" : "Note saved");
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this note."),
  });

  const options: UserBook[] = books.data?.items ?? [];
  const canSave = title.trim().length > 0 && content.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit note" : "New note"}
      description="Capture an idea while it is still alive. Link it to a book if it belongs to one."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canSave}>
            {isEdit ? "Save changes" : "Save note"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) save.mutate();
        }}
      >
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}
        <div>
          <Label htmlFor="note-title">Title *</Label>
          <Input id="note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="The idea in one line" autoFocus />
        </div>
        <div>
          <Label htmlFor="note-content">Note *</Label>
          <Textarea id="note-content" rows={7} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write freely…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="note-book">Book</Label>
            <Select id="note-book" value={bookId} onChange={(event) => setBookId(event.target.value)}>
              <option value="">No book</option>
              {options.map((book) => (
                <option key={book.id} value={book.id}>{book.book.title}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="note-page">Page / location</Label>
            <Input id="note-page" value={pageRef} onChange={(event) => setPageRef(event.target.value)} placeholder="p. 142" />
          </div>
        </div>
        <div>
          <Label htmlFor="note-tags" hint="comma separated">Tags</Label>
          <Input id="note-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="practice, attention" />
        </div>
        <button
          type="button"
          onClick={() => setImportant((value) => !value)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-[13px] transition-colors",
            important ? "border-warning/40 bg-warning/5" : "border-border hover:border-foreground/20",
          )}
          aria-pressed={important}
        >
          <Star className={cn("h-4 w-4", important ? "fill-warning text-warning" : "text-muted-foreground")} />
          <span className="flex-1">Mark as important</span>
          <span className="text-[11px] text-muted-foreground">{important ? "Important" : "Normal"}</span>
        </button>
      </form>
    </Dialog>
  );
}
