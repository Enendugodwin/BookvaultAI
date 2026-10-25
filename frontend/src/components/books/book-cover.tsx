import { useState } from "react";
import { BookOpen } from "lucide-react";
import { cn, coverGradient } from "@/lib/utils";

export function BookCover({
  title,
  authors,
  url,
  className,
  compact = false,
}: {
  title: string;
  authors?: string[];
  url?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(url) && !failed;

  return (
    <div
      className={cn(
        "relative isolate flex shrink-0 overflow-hidden rounded-[3px] shadow-[0_8px_20px_-10px_rgba(28,25,23,0.55)]",
        className,
      )}
      style={showImage ? undefined : { backgroundImage: coverGradient(title) }}
    >
      {showImage ? (
        <img
          src={url ?? ""}
          alt={`Cover of ${title}`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={cn("flex h-full w-full flex-col justify-between p-2.5 text-white/95", compact && "p-1.5")}>
          <BookOpen className={cn("h-3.5 w-3.5 opacity-70", compact && "h-3 w-3")} />
          <div>
            <p className={cn("line-clamp-3 font-display text-[12px] font-semibold leading-tight", compact && "text-[9px] leading-[1.15]")}>
              {title}
            </p>
            {!compact && authors?.[0] && (
              <p className="mt-1 line-clamp-1 text-[9px] uppercase tracking-[0.1em] text-white/70">{authors[0]}</p>
            )}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-black/15" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/10 via-transparent to-white/10" aria-hidden />
    </div>
  );
}
