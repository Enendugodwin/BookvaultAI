import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Highlight, UserBook } from "@/lib/types";
import { parseTags } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function HighlightDialog({
  open,
  onClose,
  highlight,
  defaultBookId,
}: {
  open: boolean;
  onClose: () => void;
  highlight?: Highlight | null;
  defaultBookId?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(highlight);
  const [text, setText] = useState("");
  const [commentary, setCommentary] = useState("");
  const [bookId, setBookId] = useState("");
  const [pageRef, setPageRef] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  const books = useQuery({
    queryKey: ["books", "highlight-picker"],
    queryFn: () => api.books.list({ page_size: 100, sort: "title", order: "asc" }),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setText(highlight?.text ?? "");
    setCommentary(highlight?.commentary ?? "");
    setBookId(highlight?.user_book_id ?? defaultBookId ?? "");
    setPageRef(highlight?.page_ref ?? "");
    setTags((highlight?.tags ?? []).join(", "));
    setError(null);
  }, [open, highlight, defaultBookId]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        text: text.trim(),
        commentary: commentary.trim() || null,
        user_book_id: bookId || null,
        page_ref: pageRef.trim() || null,
        tags: parseTags(tags),
      };
      return isEdit ? api.highlights.update(highlight!.id, payload) : api.highlights.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["highlights"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success(isEdit ? "Highlight updated" : "Highlight saved");
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this highlight."),
  });

  const options: UserBook[] = books.data?.items ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit highlight" : "New highlight"}
      description="Keep the sentence, then add why it mattered."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!text.trim()}>
            {isEdit ? "Save changes" : "Save highlight"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}
        <div>
          <Label htmlFor="highlight-text">Passage *</Label>
          <Textarea id="highlight-text" rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder="The passage, exactly as it appears…" className="font-display text-[15px] leading-7" />
        </div>
        <div>
          <Label htmlFor="highlight-commentary">Why it matters</Label>
          <Textarea id="highlight-commentary" rows={3} value={commentary} onChange={(event) => setCommentary(event.target.value)} placeholder="Your response, question, or connection…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="highlight-book">Book</Label>
            <Select id="highlight-book" value={bookId} onChange={(event) => setBookId(event.target.value)}>
              <option value="">No book</option>
              {options.map((book) => (
                <option key={book.id} value={book.id}>{book.book.title}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="highlight-page">Page / location</Label>
            <Input id="highlight-page" value={pageRef} onChange={(event) => setPageRef(event.target.value)} placeholder="p. 88" />
          </div>
        </div>
        <div>
          <Label htmlFor="highlight-tags" hint="comma separated">Tags</Label>
          <Input id="highlight-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        </div>
      </form>
    </Dialog>
  );
}
