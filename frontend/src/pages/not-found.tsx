import { Link } from "react-router-dom";
import { Compass, Home, LibraryBig } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-6xl font-semibold text-primary/30">404</p>
      <h1 className="mt-3 font-display text-2xl font-semibold">This page is missing from the shelf</h1>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">
        The link may be old, or the page may have moved. Your library is exactly where you left it.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          to="/"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Home className="h-4 w-4" /> Dashboard
        </Link>
        <Link
          to="/library"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted/60"
        >
          <LibraryBig className="h-4 w-4" /> Library
        </Link>
        <Link
          to="/discover"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted/60"
        >
          <Compass className="h-4 w-4" /> Discover
        </Link>
      </div>
    </div>
  );
}
