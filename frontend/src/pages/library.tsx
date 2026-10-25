import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Download, Grid2X2, LibraryBig, List, Plus, Search, SlidersHorizontal, Upload, X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { UserBook } from "@/lib/types";
import { useDebounce } from "@/hooks/use-debounce";
import { cn, formatDate, relativeTime, statusLabel, statusTone } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BookCard } from "@/components/books/book-card";
import { BookCover } from "@/components/books/book-cover";
import { BookFormDialog } from "@/components/books/book-form-dialog";
import { ImportDialog } from "@/components/data/import-dialog";
import { ExportDialog } from "@/components/data/export-dialog";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All shelves" },
  { value: "reading,rereading", label: "Reading" },
  { value: "want_to_read", label: "Want to read" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
  { value: "abandoned", label: "Abandoned" },
];

const SORTS = [
  { value: "date_added:desc", label: "Recently added" },
  { value: "updated:desc", label: "Recently updated" },
  { value: "title:asc", label: "Title A–Z" },
  { value: "title:desc", label: "Title Z–A" },
  { value: "author:asc", label: "Author A–Z" },
  { value: "rating:desc", label: "Highest rated" },
  { value: "completed_at:desc", label: "Recently finished" },
];

export function LibraryPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [status, setStatus] = useState("");
  const [genre, setGenre] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("date_added:desc");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">(
    () => (localStorage.getItem("bv-library-view") as "grid" | "list") || "grid",
  );
  const [showFilters, setShowFilters] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const [sortField, sortOrder] = sort.split(":");

  const params = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      status: status || undefined,
      genre: genre || undefined,
      tag: tag || undefined,
      sort: sortField,
      order: sortOrder,
      page,
      page_size: view === "grid" ? 24 : 20,
    }),
    [debouncedSearch, status, genre, tag, sortField, sortOrder, page, view],
  );

  const books = useQuery({
    queryKey: ["books", params],
    queryFn: () => api.books.list(params),
    placeholderData: keepPreviousData,
  });

  const facets = useQuery({ queryKey: ["facets"], queryFn: api.books.facets, staleTime: 60_000 });

  const activeFilters = [status, genre, tag].filter(Boolean).length;
  const statusCounts = facets.data?.statuses ?? {};

  function resetFilters() {
    setSearch("");
    setStatus("");
    setGenre("");
    setTag("");
    setPage(1);
  }

  function switchView(next: "grid" | "list") {
    setView(next);
    localStorage.setItem("bv-library-view", next);
    setPage(1);
  }

  const items = books.data?.items ?? [];
  const total = books.data?.total ?? 0;
  const pages = books.data?.pages ?? 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Your collection"
        title="Library"
        description="Every book you own, want, or finished — searchable, filterable, and yours to export."
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" size="md" onClick={() => setExportOpen(true)}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add book
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-muted-foreground">
        <span><strong className="font-semibold text-foreground">{total}</strong> books</span>
        <span className="text-border">·</span>
        <span><strong className="font-semibold text-foreground">{statusCounts.reading ?? 0}</strong> reading</span>
        <span className="text-border">·</span>
        <span><strong className="font-semibold text-foreground">{statusCounts.completed ?? 0}</strong> finished</span>
        <span className="text-border">·</span>
        <span><strong className="font-semibold text-foreground">{statusCounts.want_to_read ?? 0}</strong> on the wishlist</span>
      </div>

      <div className="surface flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search title, author, or ISBN…"
              className="pl-9"
              aria-label="Search library"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant={showFilters || activeFilters ? "secondary" : "outline"}
            onClick={() => setShowFilters((value) => !value)}
            className="shrink-0"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilters > 0 && <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">{activeFilters}</span>}
          </Button>
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
            className="w-auto min-w-[160px]"
            aria-label="Sort books"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => switchView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={cn("flex h-9 w-9 items-center justify-center", view === "grid" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}
            >
              <Grid2X2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => switchView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={cn("flex h-9 w-9 items-center justify-center border-l border-border", view === "list" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="filter-status" className="label">Shelf</label>
              <Select id="filter-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="filter-genre" className="label">Genre</label>
              <Select id="filter-genre" value={genre} onChange={(event) => { setGenre(event.target.value); setPage(1); }}>
                <option value="">All genres</option>
                {facets.data?.genres.map((item) => (
                  <option key={item.name} value={item.name}>{item.name} ({item.count})</option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="filter-tag" className="label">Tag</label>
              <Select id="filter-tag" value={tag} onChange={(event) => { setTag(event.target.value); setPage(1); }}>
                <option value="">All tags</option>
                {facets.data?.tags.map((item) => (
                  <option key={item.name} value={item.name}>{item.name} ({item.count})</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!activeFilters && !search}>
                Clear filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {books.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={LibraryBig}
          title={search || activeFilters ? "No books match those filters" : "Your library is waiting"}
          description={
            search || activeFilters
              ? "Try a broader search, another shelf, or clear the filters."
              : "Add a book manually, import a CSV, or discover something from the catalogue."
          }
          action={
            search || activeFilters ? (
              <Button variant="outline" onClick={resetFilters}>Clear filters</Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add a book</Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import</Button>
              </div>
            )
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <BookCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <LibraryTable items={items} />
      )}

      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <p className="text-[12px] text-muted-foreground">
            Showing {(page - 1) * (view === "grid" ? 24 : 20) + 1}–{Math.min(page * (view === "grid" ? 24 : 20), total)} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
              Previous
            </Button>
            <span className="px-2 text-[12px] tabular-nums text-muted-foreground">{page} / {pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page === pages}>
              Next
            </Button>
          </div>
        </div>
      )}

      <BookFormDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function LibraryTable({ items }: { items: UserBook[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-soft">
      <div className="overflow-x-auto">
        <table className="table-base min-w-[720px]">
          <thead>
            <tr>
              <th className="w-[42%]">Book</th>
              <th>Shelf</th>
              <th>Progress</th>
              <th>Rating</th>
              <th>Added</th>
              <th className="text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-muted/40">
                <td>
                  <Link to={`/books/${item.id}`} className="flex items-center gap-3">
                    <BookCover title={item.book.title} authors={item.book.authors} url={item.book.cover_url} className="h-12 w-9" compact />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{item.book.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{item.book.authors.join(", ") || "Unknown author"}</span>
                    </span>
                  </Link>
                </td>
                <td><Badge className={cn("font-medium", statusTone(item.status))}>{statusLabel(item.status)}</Badge></td>
                <td>
                  <div className="flex items-center gap-2">
                    <Progress value={item.progress_percent} className="h-1 w-16" />
                    <span className="text-[11px] tabular-nums text-muted-foreground">{item.progress_percent !== null ? `${Math.round(item.progress_percent)}%` : "—"}</span>
                  </div>
                </td>
                <td className="text-[12px] tabular-nums">{item.rating ? item.rating.toFixed(1) : "—"}</td>
                <td className="text-[11.5px] text-muted-foreground">{formatDate(item.created_at)}</td>
                <td className="text-right text-[11.5px] text-muted-foreground">{relativeTime(item.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
