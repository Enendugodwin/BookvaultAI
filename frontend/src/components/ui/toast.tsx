import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastApi {
  toast: (title: string, options?: { description?: string; tone?: ToastTone }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let counter = 0;

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: TriangleAlert,
};

const tones: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-destructive",
  info: "text-primary",
  warning: "text-warning",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (title: string, options?: { description?: string; tone?: ToastTone }) => {
      const id = ++counter;
      setItems((current) => [...current.slice(-3), { id, title, description: options?.description, tone: options?.tone ?? "info" }]);
      window.setTimeout(() => remove(id), 5200);
    },
    [remove],
  );

  const value = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast(title, { tone: "success", description }),
      error: (title, description) => toast(title, { tone: "error", description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {items.map((item) => {
          const Icon = icons[item.tone];
          return (
            <div
              key={item.id}
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card p-3.5 shadow-lift animate-fade-up"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tones[item.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-5">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{item.description}</p>
                )}
              </div>
              <button
                onClick={() => remove(item.id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
