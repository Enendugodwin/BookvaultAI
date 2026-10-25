import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, Check, Sparkles, Target } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AuthResponse } from "@/lib/types";
import { useAuth } from "@/context/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const GENRES = [
  "Literary fiction", "Science fiction", "Fantasy", "Mystery", "History", "Biography",
  "Science", "Philosophy", "Psychology", "Business", "Self improvement", "Poetry",
  "Essays", "Technology", "Art", "Nature",
];

export function OnboardingPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [annualGoal, setAnnualGoal] = useState(24);
  const [customGoal, setCustomGoal] = useState("");
  const [genres, setGenres] = useState<string[]>(user?.settings.preferred_genres ?? []);
  const [reminderTime, setReminderTime] = useState(user?.settings.reminder_time ?? "20:00");
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = useMutation<AuthResponse, Error, boolean>({
    mutationFn: (skip = false) =>
      api.auth.onboarding({
        annual_goal: skip ? null : customGoal ? Number(customGoal) : annualGoal,
        genres: skip ? [] : genres,
        reminder_time: reminderTime,
        notify_email: notifyEmail,
        ai_consent: aiConsent,
        skip,
      }),
    onSuccess: ({ user: updated }, skip) => {
      setUser(updated);
      toast.success(skip ? "You're all set" : "Your reading desk is ready");
      navigate("/", { replace: true });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not finish setup."),
  });

  function toggleGenre(genre: string) {
    setGenres((current) =>
      current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre].slice(0, 8),
    );
  }

  const steps = [
    { icon: BookOpen, title: "Welcome to your reading desk" },
    { icon: Target, title: "What are you reaching for?" },
    { icon: Sparkles, title: "Make it yours" },
  ];

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="absolute inset-0 grain opacity-60" aria-hidden />
      <header className="relative flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold">YVO's Book Vault</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => finish.mutate(true)} loading={finish.isPending && finish.variables === true}>
          Skip setup
        </Button>
      </header>

      <main className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 pb-16 pt-4 sm:px-8">
        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((item, index) => (
            <div key={item.title} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-semibold transition-colors",
                  index < step
                    ? "border-primary bg-primary text-primary-foreground"
                    : index === step
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {index < steps.length - 1 && <span className={cn("h-px w-8", index < step ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>

        <div className="surface p-6 shadow-lift sm:p-9 animate-fade-up">
          {error && <div className="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}

          {step === 0 && (
            <div className="text-center">
              <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </span>
              <h1 className="text-balance font-display text-3xl font-semibold leading-tight">
                Hello, {user?.display_name.split(" ")[0]}. Let's build a reading practice.
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">
                YVO's Book Vault keeps your library, sessions, notes and goals in one private place.
                Setup takes about a minute, and everything can be changed later.
              </p>
              <div className="mx-auto mt-7 grid max-w-md gap-2.5 text-left">
                {[
                  "Track reading time without spreadsheets",
                  "See patterns in your attention, not just page counts",
                  "Keep notes and highlights connected to books",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-2.5 text-[13px] text-foreground/80">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h1 className="font-display text-2xl font-semibold">Set a gentle annual goal</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Choose something sustainable. You can change or remove it at any time.
              </p>
              <div className="mt-5 grid grid-cols-4 gap-2">
                {[12, 24, 36, 52].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setAnnualGoal(value);
                      setCustomGoal("");
                    }}
                    className={cn(
                      "rounded-md border px-2 py-3 text-center transition-colors",
                      annualGoal === value && !customGoal
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-foreground/25",
                    )}
                  >
                    <span className="block font-display text-xl font-semibold">{value}</span>
                    <span className="text-[10.5px] text-muted-foreground">books</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Label htmlFor="custom-goal" className="mb-0 whitespace-nowrap text-[12.5px]">Or a custom goal</Label>
                <Input
                  id="custom-goal"
                  type="number"
                  min={1}
                  max={1000}
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  placeholder="e.g. 30"
                  className="h-9"
                />
              </div>

              <div className="mt-7">
                <h2 className="text-[15px] font-semibold">Genres you gravitate toward</h2>
                <p className="mt-1 text-[12.5px] text-muted-foreground">Pick up to eight. This only tunes suggestions.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {GENRES.map((genre) => {
                    const active = genres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => toggleGenre(genre)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                        )}
                      >
                        {genre}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="font-display text-2xl font-semibold">A few last details</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                These settings keep reminders useful and AI predictable.
              </p>
              <div className="mt-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="reminder-time">Daily reminder time</Label>
                    <Input id="reminder-time" type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
                  </div>
                  <label className="flex items-start gap-3 rounded-md border border-border p-3">
                    <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
                    <span>
                      <span className="block text-[13px] font-medium">Email reminders</span>
                      <span className="block text-[11.5px] leading-5 text-muted-foreground">Requires the server to have email configured.</span>
                    </span>
                  </label>
                </div>
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
                    <span>
                      <span className="block text-[13px] font-medium">Allow external AI processing</span>
                      <span className="block text-[11.5px] leading-5 text-muted-foreground">
                        When enabled, summaries and answers may send your notes to the configured AI provider.
                        Without consent, AI features stay off. AI never receives anything unless you ask it a question.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="rounded-md border border-border p-4">
                  <p className="text-[13px] font-medium">Bring your library later</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                    You can import a CSV or JSON file from Library → Import at any time. No data is imported during setup.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <Button onClick={() => setStep((value) => value + 1)}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => finish.mutate(false)} loading={finish.isPending && finish.variables === false}>
                Enter YVO's Book Vault <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Step {step + 1} of 3 · everything is editable in Settings
        </p>
      </main>
    </div>
  );
}
