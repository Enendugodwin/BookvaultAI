import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookHeart, CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { JournalEntry } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { JournalDialog } from "@/components/knowledge/journal-dialog";

const SECTIONS = [
  { key: "reflections", label: "Reflections" },
  { key: "ideas", label: "Ideas" },
  { key: "questions", label: "Questions" },
  { key: "lessons", label: "Lessons" },
  { key: "applications", label: "Applications" },
] as const;

export function JournalPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);

  const entries = useQuery({
    queryKey: ["journal", month, page],
    queryFn: () => api.journal.list({ month: month || undefined, page, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  const months = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let index = 0; index < 18; index += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      options.push({ value, label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }) });
    }
    return options;
  }, []);

  const remove = useMutation({
    mutationFn: () => api.journal.remove(deleteTarget!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journal"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Journal entry deleted");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error("Could not delete entry", err instanceof ApiError ? err.message : undefined),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Reading journal"
        title="Journal"
        description="A private record of what reading is doing to your thinking."
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> New entry
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          value={month}
          onChange={(event) => { setMonth(event.target.value); setPage(1); }}
          className="w-auto min-w-[180px]"
          aria-label="Filter by month"
        >
          <option value="">All months</option>
          {months.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <span className="text-[12px] text-muted-foreground">
          {entries.data?.total ?? 0} {entries.data?.total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {entries.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : entries.data?.items.length ? (
        <div className="space-y-4">
          {entries.data.items.map((entry) => (
            <article key={entry.id} className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(entry.entry_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  {entry.title && <h2 className="mt-1 font-display text-xl font-semibold">{entry.title}</h2>}
                  {entry.mood && <Badge className="mt-2 bg-accent/10 text-accent">felt {entry.mood}</Badge>}
                </div>
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(entry); setDialogOpen(true); }} aria-label="Edit entry">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(entry)} aria-label="Delete entry">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {SECTIONS.map((section) => {
                  const value = entry[section.key];
                  if (!value) return null;
                  return (
                    <div key={section.key} className={section.key === "reflections" ? "sm:col-span-2" : undefined}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{section.label}</p>
                      <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-foreground/85">{value}</p>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}

          {(entries.data.pages ?? 1) > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</Button>
              <span className="text-[12px] text-muted-foreground">{page} / {entries.data.pages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(entries.data?.pages ?? 1, value + 1))} disabled={page === (entries.data?.pages ?? 1)}>Next</Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={BookHeart}
          title={month ? "No entries this month" : "Your journal is empty"}
          description="Reflect on a passage, capture a question, or note how a book changed your mind."
          action={<Button onClick={() => { setEditing(null); setDialogOpen(true); }}>Write your first entry</Button>}
        />
      )}

      <JournalDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditing(null); }} entry={editing} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this journal entry?"
        description={deleteTarget ? formatDate(deleteTarget.entry_date) : ""}
        confirmLabel="Delete entry"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
