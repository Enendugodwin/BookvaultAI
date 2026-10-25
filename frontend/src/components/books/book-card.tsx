import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { UserBook } from "@/lib/types";
import { cn, statusLabel, statusTone } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookCover } from "./book-cover";

export function BookCard({ item, className }: { item: UserBook; className?: string }) {
  const { book } = item;
  return (
    <Link
      to={`/books/${item.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card p-3 shadow-soft transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lift",
        className,
      )}
    >
      <div className="relative mb-3 flex aspect-[2/3] items-stretch justify-center overflow-hidden rounded-sm bg-muted/50 p-3">
        <BookCover
          title={book.title}
          authors={book.authors}
          url={book.cover_url}
          className="h-full w-auto max-w-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {item.status === "completed" && item.rating ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-card/95 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">
            <Star className="h-2.5 w-2.5 fill-warning text-warning" />
            {item.rating.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col">
        <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{book.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">
          {book.authors.length ? book.authors.join(", ") : "Unknown author"}
        </p>
        <div className="mt-auto pt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Badge className={cn("px-1.5 py-0 text-[10px]", statusTone(item.status))}>{statusLabel(item.status)}</Badge>
            {item.progress_percent !== null && (
              <span className="text-[10.5px] tabular-nums text-muted-foreground">{Math.round(item.progress_percent)}%</span>
            )}
          </div>
          <Progress value={item.progress_percent} className="h-1" label={`Progress for ${book.title}`} />
        </div>
      </div>
    </Link>
  );
}

export function BookRow({ item }: { item: UserBook }) {
  return (
    <Link
      to={`/books/${item.id}`}
      className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50"
    >
      <BookCover title={item.book.title} authors={item.book.authors} url={item.book.cover_url} className="h-14 w-10" compact />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{item.book.title}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {item.book.authors.join(", ") || "Unknown author"}
          {item.current_page !== null && item.book.page_count ? ` · p. ${item.current_page}/${item.book.page_count}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {item.progress_percent !== null ? `${Math.round(item.progress_percent)}%` : statusLabel(item.status)}
      </span>
    </Link>
  );
}
