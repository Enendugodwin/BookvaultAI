import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, Highlighter, Lightbulb, NotebookPen, Pencil, Plus, Search, Sparkles, Star, Trash2, X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Highlight, Note } from "@/lib/types";
import { useDebounce } from "@/hooks/use-debounce";
import { cn, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { NoteDialog } from "@/components/knowledge/note-dialog";
import { HighlightDialog } from "@/components/knowledge/highlight-dialog";

type NotesTab = "notes" | "highlights" | "important" | "insights";

export function NotesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<NotesTab>("notes");
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [noteOpen, setNoteOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<Note | null>(null);
  const [deleteHighlightTarget, setDeleteHighlightTarget] = useState<Highlight | null>(null);

  const notes = useQuery({
    queryKey: ["notes", { q: debounced, important: tab === "important", page }],
    queryFn: () =>
      api.notes.list({
        q: debounced || undefined,
        important: tab === "important" ? true : undefined,
        page,
        page_size: 20,
      }),
    placeholderData: keepPreviousData,
    enabled: tab === "notes" || tab === "important",
  });

  const highlights = useQuery({
    queryKey: ["highlights", debounced],
    queryFn: () => api.highlights.list({ q: debounced || undefined }),
    enabled: tab === "highlights",
  });

  const knowledge = useQuery({ queryKey: ["knowledge", "overview"], queryFn: api.knowledge.overview });
  const insights = useQuery({
    queryKey: ["ai", "insights", "pending"],
    queryFn: () => api.ai.insights("pending"),
    enabled: tab === "insights",
  });

  const globalSearch = useQuery({
    queryKey: ["knowledge", "search", debounced],
    queryFn: () => api.knowledge.search(debounced.trim()),
    enabled: debounced.trim().length >= 2,
  });

  const removeNote = useMutation({
    mutationFn: () => api.notes.remove(deleteNoteTarget!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Note deleted");
      setDeleteNoteTarget(null);
    },
    onError: (err) => toast.error("Could not delete note", err instanceof ApiError ? err.message : undefined),
  });

  const removeHighlight = useMutation({
    mutationFn: () => api.highlights.remove(deleteHighlightTarget!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["highlights"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Highlight deleted");
      setDeleteHighlightTarget(null);
    },
    onError: (err) => toast.error("Could not delete highlight", err instanceof ApiError ? err.message : undefined),
  });

  const acceptInsight = useMutation({
    mutationFn: (id: string) => api.ai.acceptInsight(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai", "insights"] });
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success("Insight saved as a note");
    },
    onError: (err) => toast.error("Could not save insight", err instanceof ApiError ? err.message : undefined),
  });

  const dismissInsight = useMutation({
    mutationFn: (id: string) => api.ai.dismissInsight(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai", "insights"] });
      toast.toast("Insight dismissed");
    },
  });

  const tabs = [
    { value: "notes" as const, label: "Notes", count: knowledge.data?.counts.notes },
    { value: "highlights" as const, label: "Highlights", count: knowledge.data?.counts.highlights },
    { value: "important" as const, label: "Important", count: knowledge.data?.counts.important },
    { value: "insights" as const, label: "AI insights" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Knowledge"
        title="Notes & highlights"
        description="The ideas worth keeping, connected to the books that produced them."
        actions={
          <>
            <Button variant="outline" onClick={() => { setEditingHighlight(null); setHighlightOpen(true); }}>
              <Highlighter className="h-4 w-4" /> Highlight
            </Button>
            <Button onClick={() => { setEditingNote(null); setNoteOpen(true); }}>
              <Plus className="h-4 w-4" /> New note
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search every note, highlight, and journal entry…"
            className="pl-9 pr-9"
            aria-label="Search knowledge"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Tabs
          className="min-w-0 max-w-full"
          tabs={tabs}
          value={tab}
          onChange={(value) => { setTab(value); setPage(1); }}
        />
      </div>

      {debounced.trim().length >= 2 && globalSearch.data ? (
        <SearchResults
          result={globalSearch.data}
          onEditNote={(note) => { setEditingNote(note); setNoteOpen(true); }}
          onEditHighlight={(highlight) => { setEditingHighlight(highlight); setHighlightOpen(true); }}
        />
      ) : tab === "insights" ? (
        <div className="space-y-3">
          <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Extracted from your notes</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              Insights are suggestions, not facts. Accept one to turn it into a note you can edit.
              Generate new insights from the AI assistant.
            </p>
          </div>
          {insights.isLoading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : insights.data?.items.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.data.items.map((insight) => (
                <div key={insight.id} className="surface flex flex-col p-4">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-[12.5px] leading-6 text-foreground/85">{insight.content}</p>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <Button size="sm" onClick={() => acceptInsight.mutate(insight.id)} loading={acceptInsight.isPending && acceptInsight.variables === insight.id}>
                      Save as note
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissInsight.mutate(insight.id)}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="No pending insights"
              description="Ask the assistant to extract insights from your notes when you have a good body of thinking to work with."
              action={<Link to="/assistant" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">Open AI assistant <ArrowRight className="h-3.5 w-3.5" /></Link>}
            />
          )}
        </div>
      ) : tab === "highlights" ? (
        highlights.isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : highlights.data?.items.length ? (
          <div className="space-y-3">
            {highlights.data.items.map((highlight) => (
              <div key={highlight.id} className="surface border-l-2 border-l-primary p-4">
                <div className="flex items-start justify-between gap-3">
                  <blockquote className="font-display text-[15px] leading-7 text-foreground/90">“{highlight.text}”</blockquote>
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingHighlight(highlight); setHighlightOpen(true); }} aria-label="Edit highlight"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteHighlightTarget(highlight)} aria-label="Delete highlight"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>
                {highlight.commentary && <p className="mt-2 border-t border-border/60 pt-2 text-[12.5px] leading-6 text-muted-foreground">{highlight.commentary}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
                  {highlight.book_title && <span>{highlight.book_title}</span>}
                  {highlight.page_ref && <span>· {highlight.page_ref}</span>}
                  <span>· {formatDate(highlight.created_at)}</span>
                  {highlight.tags.map((tag) => <Badge key={tag} className="text-[9.5px]">#{tag}</Badge>)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Highlighter}
            title="No highlights yet"
            description="Save passages that stop you. Add a line about why it mattered."
            action={<Button onClick={() => setHighlightOpen(true)}>Save a highlight</Button>}
          />
        )
      ) : notes.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : notes.data?.items.length ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {notes.data.items.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => { setEditingNote(note); setNoteOpen(true); }}
                onDelete={() => setDeleteNoteTarget(note)}
              />
            ))}
          </div>
          {(notes.data.pages ?? 1) > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</Button>
              <span className="text-[12px] text-muted-foreground">{page} / {notes.data.pages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(notes.data?.pages ?? 1, value + 1))} disabled={page === (notes.data?.pages ?? 1)}>Next</Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={NotebookPen}
          title={tab === "important" ? "No important notes" : "No notes yet"}
          description={
            tab === "important"
              ? "Mark a note as important and it will appear here for quick recall."
              : "Notes are where reading becomes thinking. Start with one idea you want to keep."
          }
          action={tab === "notes" ? <Button onClick={() => setNoteOpen(true)}>Write a note</Button> : undefined}
        />
      )}

      {knowledge.data && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-card/50 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Top tags</span>
          {knowledge.data.top_tags.length ? knowledge.data.top_tags.slice(0, 8).map((tag) => (
            <button key={tag.name} onClick={() => setSearch(tag.name)} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
              #{tag.name} <span className="text-[10px] opacity-60">{tag.count}</span>
            </button>
          )) : <span className="text-[11.5px] text-muted-foreground">Add tags to your notes to build connections.</span>}
        </div>
      )}

      <NoteDialog open={noteOpen} onClose={() => { setNoteOpen(false); setEditingNote(null); }} note={editingNote} />
      <HighlightDialog open={highlightOpen} onClose={() => { setHighlightOpen(false); setEditingHighlight(null); }} highlight={editingHighlight} />
      <ConfirmDialog
        open={Boolean(deleteNoteTarget)}
        title="Delete this note?"
        description={deleteNoteTarget?.title ?? ""}
        confirmLabel="Delete note"
        destructive
        loading={removeNote.isPending}
        onConfirm={() => removeNote.mutate()}
        onClose={() => setDeleteNoteTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteHighlightTarget)}
        title="Delete this highlight?"
        description="The passage and commentary will be removed."
        confirmLabel="Delete highlight"
        destructive
        loading={removeHighlight.isPending}
        onConfirm={() => removeHighlight.mutate()}
        onClose={() => setDeleteHighlightTarget(null)}
      />
    </div>
  );
}

function NoteCard({ note, onEdit, onDelete }: { note: Note; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className={cn("surface flex flex-col p-4", note.is_important && "border-warning/40")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            {note.is_important && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
            <span className="truncate">{note.title}</span>
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {note.book_title ? `${note.book_title} · ` : ""}{note.page_ref ? `${note.page_ref} · ` : ""}{formatDate(note.updated_at)}
          </p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit note"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete note"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </div>
      </div>
      <p className="mt-2 line-clamp-5 whitespace-pre-line text-[12.5px] leading-6 text-foreground/80">{note.content}</p>
      {(note.tags.length > 0 || note.source === "ai") && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.source === "ai" && <Badge className="bg-primary/10 text-[9.5px] text-primary">AI insight</Badge>}
          {note.tags.map((tag) => <Badge key={tag} className="text-[9.5px]">#{tag}</Badge>)}
        </div>
      )}
    </div>
  );
}

function SearchResults({
  result,
  onEditNote,
  onEditHighlight,
}: {
  result: import("@/lib/types").KnowledgeSearch;
  onEditNote: (note: Note) => void;
  onEditHighlight: (highlight: Highlight) => void;
}) {
  const total = result.notes.length + result.highlights.length + result.journal.length;
  if (!total) {
    return <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">Nothing matched that search.</p>;
  }
  return (
    <div className="space-y-5">
      <p className="text-[12px] text-muted-foreground">{total} matches across your knowledge base</p>
      {result.notes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Notes · {result.notes.length}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {result.notes.map((note) => <NoteCard key={note.id} note={note} onEdit={() => onEditNote(note)} onDelete={() => undefined} />)}
          </div>
        </section>
      )}
      {result.highlights.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Highlights · {result.highlights.length}</h2>
          <div className="space-y-2">
            {result.highlights.map((highlight) => (
              <button key={highlight.id} onClick={() => onEditHighlight(highlight)} className="surface block w-full border-l-2 border-l-primary p-4 text-left">
                <blockquote className="font-display text-[14px] leading-7">“{highlight.text}”</blockquote>
                {highlight.commentary && <p className="mt-1.5 text-[12px] leading-6 text-muted-foreground">{highlight.commentary}</p>}
                <p className="mt-1 text-[10.5px] text-muted-foreground">{highlight.book_title ?? "Unlinked"} · {formatDate(highlight.created_at)}</p>
              </button>
            ))}
          </div>
        </section>
      )}
      {result.journal.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Journal · {result.journal.length}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {result.journal.map((entry) => (
              <Link key={entry.id} to="/journal" className="surface block p-4 transition-colors hover:border-primary/40">
                <p className="text-[13px] font-semibold">{entry.title || formatDate(entry.entry_date)}</p>
                <p className="mt-1 line-clamp-3 text-[12px] leading-6 text-muted-foreground">{entry.reflections || entry.ideas || entry.lessons || "Journal entry"}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
