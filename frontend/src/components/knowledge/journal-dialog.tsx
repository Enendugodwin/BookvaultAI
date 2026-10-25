import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { JournalEntry } from "@/lib/types";
import { todayISO } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const MOODS = ["", "curious", "focused", "moved", "restless", "grateful", "tired", "hopeful"];

export function JournalDialog({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry?: JournalEntry | null;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEdit = Boolean(entry);
  const [entryDate, setEntryDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("");
  const [reflections, setReflections] = useState("");
  const [ideas, setIdeas] = useState("");
  const [questions, setQuestions] = useState("");
  const [lessons, setLessons] = useState("");
  const [applications, setApplications] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntryDate(entry?.entry_date ?? todayISO());
    setTitle(entry?.title ?? "");
    setMood(entry?.mood ?? "");
    setReflections(entry?.reflections ?? "");
    setIdeas(entry?.ideas ?? "");
    setQuestions(entry?.questions ?? "");
    setLessons(entry?.lessons ?? "");
    setApplications(entry?.applications ?? "");
    setError(null);
  }, [open, entry]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        entry_date: entryDate,
        title: title.trim() || null,
        mood: mood || null,
        reflections: reflections.trim() || null,
        ideas: ideas.trim() || null,
        questions: questions.trim() || null,
        lessons: lessons.trim() || null,
        applications: applications.trim() || null,
      };
      return isEdit ? api.journal.update(entry!.id, payload) : api.journal.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journal"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success(isEdit ? "Journal entry updated" : "Journal entry saved");
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save this entry."),
  });

  const hasContent = [reflections, ideas, questions, lessons, applications].some((value) => value.trim().length > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit journal entry" : "New journal entry"}
      description="A private place to think on paper. Nothing here is shared or published."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!hasContent}>
            {isEdit ? "Save changes" : "Save entry"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (hasContent) save.mutate();
        }}
      >
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-[160px_1fr_140px]">
          <div>
            <Label htmlFor="journal-date">Date</Label>
            <Input id="journal-date" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="journal-title">Title</Label>
            <Input id="journal-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label htmlFor="journal-mood">Mood</Label>
            <Select id="journal-mood" value={mood} onChange={(event) => setMood(event.target.value)}>
              {MOODS.map((value) => (
                <option key={value} value={value}>{value || "—"}</option>
              ))}
            </Select>
          </div>
        </div>
        {[
          { key: "reflections", label: "Reflections", value: reflections, set: setReflections, placeholder: "What did this reading stir in you?" },
          { key: "ideas", label: "Ideas", value: ideas, set: setIdeas, placeholder: "What new thought is worth pursuing?" },
          { key: "questions", label: "Questions", value: questions, set: setQuestions, placeholder: "What are you still unsure about?" },
          { key: "lessons", label: "Lessons", value: lessons, set: setLessons, placeholder: "What did you learn about yourself or the world?" },
          { key: "applications", label: "Applications", value: applications, set: setApplications, placeholder: "What will you do differently?" },
        ].map((field) => (
          <div key={field.key}>
            <Label htmlFor={`journal-${field.key}`}>{field.label}</Label>
            <Textarea
              id={`journal-${field.key}`}
              rows={3}
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </form>
    </Dialog>
  );
}
