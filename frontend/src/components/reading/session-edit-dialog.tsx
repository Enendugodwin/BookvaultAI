import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ReadingSession } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function toLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SessionEditDialog({
  session,
  onClose,
}: {
  session: ReadingSession | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [startPage, setStartPage] = useState("");
  const [endPage, setEndPage] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setStartedAt(toLocalInput(session.started_at));
    setEndedAt(toLocalInput(session.ended_at));
    setStartPage(session.start_page !== null ? String(session.start_page) : "");
    setEndPage(session.end_page !== null ? String(session.end_page) : "");
    setNotes(session.notes ?? "");
    setError(null);
  }, [session]);

  const update = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("No session");
      return api.sessions.update(session.id, {
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        start_page: startPage ? Number(startPage) : null,
        end_page: endPage ? Number(endPage) : null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success("Session updated");
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not update the session."),
  });

  return (
    <Dialog
      open={Boolean(session)}
      onClose={onClose}
      title="Edit reading session"
      description={session ? `Adjust the recorded session for ${session.book_title}.` : undefined}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button onClick={() => update.mutate()} loading={update.isPending}>Save changes</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate();
        }}
      >
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit-start">Started</Label>
            <Input id="edit-start" type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-end">Ended</Label>
            <Input id="edit-end" type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="edit-start-page">Start page</Label>
            <Input id="edit-start-page" type="number" min={0} value={startPage} onChange={(event) => setStartPage(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-end-page">End page</Label>
            <Input id="edit-end-page" type="number" min={0} value={endPage} onChange={(event) => setEndPage(event.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea id="edit-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </form>
    </Dialog>
  );
}
