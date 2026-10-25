import type { ReactNode } from "react";
import { BookOpen, Sparkles, Target } from "lucide-react";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#1c1917] p-12 text-[#f4ede4] lg:flex">
        <div className="absolute inset-0 grain opacity-30" aria-hidden />
        <div
          className="absolute -right-28 top-1/3 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #c86b45 0%, transparent 70%)" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f4ede4] text-[#1c1917]">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold leading-none">BookVault</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[#f4ede4]/50">AI reading desk</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-[2.6rem] font-medium leading-[1.08] text-balance">
            A quiet place for the books that change how you think.
          </p>
          <p className="mt-5 text-[14.5px] leading-7 text-[#f4ede4]/60">
            Track the time you actually read, keep the ideas worth returning to, and let
            analytics show you the shape of your attention.
          </p>
          <div className="mt-10 grid gap-4 text-[13px] text-[#f4ede4]/70">
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 h-4 w-4 text-[#d8926d]" />
              <p>Goals grounded in your real pace, never arbitrary numbers.</p>
            </div>
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 text-[#d8926d]" />
              <p>AI that works only from your notes — with coverage stated plainly.</p>
            </div>
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-4 w-4 text-[#d8926d]" />
              <p>Your library, notes and journal — exportable at any time.</p>
            </div>
          </div>
        </div>

        <p className="relative text-[11px] uppercase tracking-[0.18em] text-[#f4ede4]/35">
          Read deliberately · remember what matters
        </p>
      </aside>

      <main className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[420px] animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background">
              <BookOpen className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-semibold">BookVault</span>
          </div>
          <h1 className="text-balance font-display text-[2rem] font-semibold leading-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-[13px] text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
