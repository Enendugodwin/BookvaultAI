import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { BookInput, BookStatus, UserBook } from "@/lib/types";
import { parseTags } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const STATUS_OPTIONS: { value: BookStatus; label: string }[] = [
  { value: "want_to_read", label: "Want to read" },
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "rereading", label: "Rereading" },
  { value: "abandoned", label: "Abandoned" },
];

export interface BookFormInitial extends Partial<BookInput> {
  title?: string;
}

export function BookFormDialog({
  open,
  onClose,
  existing,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing?: UserBook;
  initial?: BookFormInitial;
  onSaved?: (book: UserBook) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(existing);
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    authors: "",
    isbn13: "",
    publisher: "",
    published_date: "",
    page_count: "",
    current_page: "",
    genre: "",
    tags: "",
    status: "want_to_read" as BookStatus,
    rating: "",
    cover_url: "",
    description: "",
    review: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const source: BookFormInitial = existing
      ? {
          ...existing.book,
          ...existing,
          genre: existing.genre ?? existing.book.categories[0] ?? "",
          isbn13: existing.book.isbn13 ?? "",
        }
      : (initial ?? {});
    setError(null);
    setForm({
      title: source.title ?? "",
      subtitle: source.subtitle ?? "",
      authors: (source.authors ?? []).join(", "),
      isbn13: source.isbn13 ?? "",
      publisher: source.publisher ?? "",
      published_date: source.published_date ?? "",
      page_count: source.page_count ? String(source.page_count) : "",
      current_page:
        existing?.current_page !== null && existing?.current_page !== undefined
          ? String(existing.current_page)
          : source.current_page !== null && source.current_page !== undefined
            ? String(source.current_page)
            : "",
      genre: source.genre ?? source.categories?.[0] ?? "",
      tags: (existing?.tags ?? source.tags ?? []).join(", "),
      status: existing?.status ?? source.status ?? "want_to_read",
      rating:
        existing?.rating !== null && existing?.rating !== undefined
          ? String(existing.rating)
          : source.rating !== null && source.rating !== undefined
            ? String(source.rating)
            : "",
      cover_url: source.cover_url ?? "",
      description: source.description ?? "",
      review: existing?.review ?? source.review ?? "",
    });
  }, [open, existing, initial]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: BookInput = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        authors: form.authors.split(",").map((a) => a.trim()).filter(Boolean),
        publisher: form.publisher.trim() || null,
        published_date: form.published_date.trim() || null,
        page_count: form.page_count ? Number(form.page_count) : null,
        current_page: form.current_page ? Number(form.current_page) : null,
        genre: form.genre.trim() || null,
        tags: parseTags(form.tags),
        status: form.status,
        rating: form.rating ? Number(form.rating) : null,
        cover_url: form.cover_url.trim() || null,
        description: form.description.trim() || null,
        review: form.review.trim() || null,
        categories: form.genre.trim() ? [form.genre.trim()] : [],
      };
      if (!isEdit) {
        payload.isbn13 = form.isbn13.trim() || null;
        payload.google_books_id = (initial as BookInput | undefined)?.google_books_id ?? null;
        payload.openlibrary_id = (initial as BookInput | undefined)?.openlibrary_id ?? null;
        payload.language = (initial as BookInput | undefined)?.language ?? null;
      }
      return isEdit ? api.books.update(existing!.id, payload) : api.books.add(payload);
    },
    onSuccess: (book) => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["facets"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["currently-reading"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(isEdit ? "Book updated" : "Book added", book.book.title);
      onSaved?.(book);
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not save this book.");
    },
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit book" : "Add a book"}
      description={isEdit ? "Update the details in your library." : "Add a title manually or paste the metadata from your edition."}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!form.title.trim()}
          >
            {isEdit ? "Save changes" : "Add to library"}
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
        {error && (
          <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="The Practice" autoFocus />
          </div>
          <div>
            <Label htmlFor="status">Shelf</Label>
            <Select id="status" value={form.status} onChange={(e) => set("status", e.target.value as BookStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="authors" hint="comma separated">Authors</Label>
          <Input id="authors" value={form.authors} onChange={(e) => set("authors", e.target.value)} placeholder="Seth Godin" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input id="subtitle" value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="genre">Genre</Label>
            <Input id="genre" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Business" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="page_count">Pages</Label>
            <Input id="page_count" type="number" min={1} value={form.page_count} onChange={(e) => set("page_count", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="current_page">Current page</Label>
            <Input id="current_page" type="number" min={0} value={form.current_page} onChange={(e) => set("current_page", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rating">Rating</Label>
            <Select id="rating" value={form.rating} onChange={(e) => set("rating", e.target.value)}>
              <option value="">Not rated</option>
              {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((rating) => (
                <option key={rating} value={rating}>{rating} / 5</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="publisher">Publisher</Label>
            <Input id="publisher" value={form.publisher} onChange={(e) => set("publisher", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="published_date">Published</Label>
            <Input id="published_date" value={form.published_date} onChange={(e) => set("published_date", e.target.value)} placeholder="2020 or 2020-05-01" />
          </div>
        </div>
        {!isEdit && (
          <div>
            <Label htmlFor="isbn13">ISBN-13</Label>
            <Input id="isbn13" value={form.isbn13} onChange={(e) => set("isbn13", e.target.value)} placeholder="978…" />
          </div>
        )}
        <div>
          <Label htmlFor="cover_url">Cover image URL</Label>
          <Input id="cover_url" type="url" value={form.cover_url} onChange={(e) => set("cover_url", e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <Label htmlFor="tags" hint="comma separated">Tags</Label>
          <Input id="tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="craft, marketing" />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
        </div>
        {isEdit && (
          <div>
            <Label htmlFor="review">Your review</Label>
            <Textarea id="review" value={form.review} onChange={(e) => set("review", e.target.value)} rows={3} />
          </div>
        )}
      </form>
    </Dialog>
  );
}
