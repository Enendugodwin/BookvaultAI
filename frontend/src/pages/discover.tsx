import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Compass, ExternalLink, Plus, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import type { CatalogueItem } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BookCover } from "@/components/books/book-cover";
import { BookFormDialog, type BookFormInitial } from "@/components/books/book-form-dialog";

export function DiscoverPage() {
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [field, setField] = useState("all");
  const [selected, setSelected] = useState<CatalogueItem | null>(null);

  const search = useQuery({
    queryKey: ["catalogue", submitted, field],
    queryFn: () => api.catalogue.search(submitted, field),
    enabled: submitted.trim().length >= 2,
    retry: false,
    staleTime: 5 * 60_000,
  });

  function runSearch(nextTerm = term) {
    const clean = nextTerm.trim();
    if (clean.length < 2) return;
    setSubmitted(clean);
  }

  const initial: BookFormInitial | undefined = selected
    ? {
        title: selected.title,
        subtitle: selected.subtitle,
        authors: selected.authors,
        isbn10: selected.isbn10,
        isbn13: selected.isbn13,
        description: selected.description,
        publisher: selected.publisher,
        published_date: selected.published_date,
        language: selected.language,
        page_count: selected.page_count,
        cover_url: selected.cover_url,
        categories: selected.categories,
        google_books_id: selected.google_books_id,
        openlibrary_id: selected.openlibrary_id,
        genre: selected.categories[0] ?? null,
      }
    : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Find your next book"
        title="Discover"
        description="Search the open catalogue by title, author, subject, or ISBN. Add a result straight to your library."
        actions={
          <Link
            to="/assistant"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted/60"
          >
            <Sparkles className="h-4 w-4 text-primary" /> AI suggestions
          </Link>
        }
      />

      <form
        className="surface flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch();
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search for a title, author, or ISBN…"
            className="pl-9"
            aria-label="Search the book catalogue"
            autoFocus
          />
        </div>
        <Select value={field} onChange={(event) => setField(event.target.value)} className="sm:w-40" aria-label="Search field">
          <option value="all">Everything</option>
          <option value="title">Title</option>
          <option value="author">Author</option>
          <option value="isbn">ISBN</option>
          <option value="subject">Subject</option>
        </Select>
        <Button type="submit" disabled={term.trim().length < 2}>Search</Button>
      </form>

      {!submitted ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "Search by ISBN", description: "Paste the number from the back of a book for an exact match." },
            { title: "Explore a subject", description: "Try “systems thinking”, “urban history”, or “attention”." },
            { title: "Follow an author", description: "Search an author you trust and see what you have missed." },
          ].map((tip) => (
            <div key={tip.title} className="surface p-4">
              <p className="text-[13px] font-semibold">{tip.title}</p>
              <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">{tip.description}</p>
            </div>
          ))}
        </div>
      ) : search.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-lg" />)}
        </div>
      ) : search.isError ? (
        <EmptyState
          icon={Compass}
          title="Catalogue unavailable"
          description={
            search.error instanceof ApiError
              ? search.error.message
              : "The external catalogue could not be reached. Your library is unaffected."
          }
        />
      ) : search.data?.items.length ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-muted-foreground">
              {search.data.items.length} results for “{submitted}”
              {search.data.cached ? " · cached" : ""}
            </p>
            {search.data.degraded && (
              <Badge className="bg-warning/10 text-warning">One catalogue source is unavailable; results may be partial.</Badge>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {search.data.items.map((item, index) => (
              <CatalogueCard
                key={`${item.title}-${item.isbn13 ?? item.isbn10 ?? index}`}
                item={item}
                onAdd={() => setSelected(item)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
            <span>{search.data.attribution}</span>
            {search.data.errors.length > 0 && <span>Sources reporting errors: {search.data.errors.join(", ")}</span>}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Compass}
          title="No matches found"
          description="Try a shorter title, an author's surname, or paste an ISBN. Some editions are not in the open catalogue."
          action={<Button variant="outline" onClick={() => { setTerm(""); setSubmitted(""); }}>Reset search</Button>}
        />
      )}

      <BookFormDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        initial={initial}
      />
    </div>
  );
}

function CatalogueCard({ item, onAdd }: { item: CatalogueItem; onAdd: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="surface flex flex-col p-4">
      <div className="flex gap-3.5">
        <BookCover title={item.title} authors={item.authors} url={item.cover_url} className="h-[118px] w-[79px]" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 font-display text-[15.5px] font-semibold leading-snug">{item.title}</h2>
          <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">{item.authors.join(", ") || "Unknown author"}</p>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            {[item.published_date?.slice(0, 4), item.page_count ? `${item.page_count} pages` : null, item.publisher]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.categories.slice(0, 2).map((category) => <Badge key={category} className="text-[9.5px]">{category}</Badge>)}
          </div>
        </div>
      </div>
      {item.description && (
        <div className="mt-3">
          <p className={expanded ? "text-[12px] leading-6 text-muted-foreground" : "line-clamp-3 text-[12px] leading-6 text-muted-foreground"}>
            {item.description}
          </p>
          {item.description.length > 160 && (
            <button onClick={() => setExpanded((value) => !value)} className="mt-1 text-[10.5px] font-medium text-primary hover:underline">
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <ExternalLink className="h-2.5 w-2.5" /> {item.source}
        </span>
        <Button size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add to library</Button>
      </div>
    </article>
  );
}
