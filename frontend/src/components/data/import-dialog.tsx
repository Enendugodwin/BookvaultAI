import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileUp, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { ImportPreview } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Phase = "choose" | "preview" | "committing" | "done";

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("queued");
  const [jobError, setJobError] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase("choose");
      setPreview(null);
      setJobId(null);
      setJobStatus("queued");
      setJobError(null);
      setError(null);
      setWaited(0);
    }
  }, [open]);

  useEffect(() => {
    if (!jobId || phase !== "committing") return;
    let cancelled = false;
    let elapsed = 0;
    const tick = async () => {
      try {
        const job = await api.jobs.get(jobId);
        if (cancelled) return;
        setJobStatus(job.status);
        if (job.status === "completed") {
          setPhase("done");
          void queryClient.invalidateQueries({ queryKey: ["books"] });
          void queryClient.invalidateQueries({ queryKey: ["facets"] });
          void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          void queryClient.invalidateQueries({ queryKey: ["imports"] });
          void queryClient.invalidateQueries({ queryKey: ["summary"] });
          toast.success("Import complete");
        } else if (job.status === "failed") {
          setPhase("done");
          setJobError(job.error ?? "The import failed.");
        }
      } catch (err) {
        if (!cancelled) setJobError(err instanceof ApiError ? err.message : "Could not read job status.");
      }
      elapsed += 2;
      setWaited(elapsed);
    };
    void tick();
    const interval = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId, phase, queryClient, toast]);

  const upload = useMutation({
    mutationFn: (file: File) => api.imports.upload(file),
    onSuccess: (result) => {
      setPreview(result);
      setPhase("preview");
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not read that file."),
  });

  const commit = useMutation({
    mutationFn: () => api.imports.commit(preview!.id),
    onSuccess: (result) => {
      setJobId(result.job_id);
      setPhase("committing");
      setWaited(0);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the import."),
  });

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(csv|json)$/i.test(file.name)) {
      setError("Upload a .csv or .json file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Import files are limited to 5 MB.");
      return;
    }
    upload.mutate(file);
  }

  const ready = preview?.preview.filter((row) => row.status === "ready").length ?? 0;
  const duplicates = preview?.duplicates ?? 0;
  const failed = preview?.errors.length ?? 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import your library"
      description="Bring books in from a CSV or JSON file. Nothing is written until you confirm the preview."
      size="lg"
      footer={
        phase === "preview" && preview ? (
          <>
            <Button variant="outline" onClick={() => { setPreview(null); setPhase("choose"); }} disabled={commit.isPending}>
              Choose another file
            </Button>
            <Button onClick={() => commit.mutate()} loading={commit.isPending} disabled={preview.total_rows === 0}>
              Import {ready} {ready === 1 ? "book" : "books"}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="space-y-4">
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}

        {phase === "choose" && (
          <div className="space-y-4">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                handleFile(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20",
              )}
            >
              {upload.isPending ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="mt-3 text-sm font-medium">Reading your file…</p>
                </>
              ) : (
                <>
                  <FileUp className="h-7 w-7 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">Drop a CSV or JSON file here</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">Up to 5 MB · UTF-8 encoded</p>
                  <Button className="mt-4" size="sm" onClick={() => inputRef.current?.click()}>
                    Choose file
                  </Button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </div>
            <div className="rounded-md border border-border/70 bg-card p-3.5">
              <p className="text-[12.5px] font-medium">Expected columns</p>
              <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                title is required. Optional: authors, isbn10, isbn13, status, rating, current_page, page_count,
                genre, tags, publisher, published_date, description.
              </p>
              <a
                href={api.imports.templateUrl}
                className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-primary hover:underline"
              >
                <Download className="h-3 w-3" /> Download CSV template
              </a>
            </div>
          </div>
        )}

        {phase === "preview" && preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge className="bg-muted text-foreground">{preview.total_rows} rows</Badge>
              <Badge className="bg-success/10 text-success">{ready} ready</Badge>
              {duplicates > 0 && <Badge className="bg-warning/10 text-warning">{duplicates} duplicates skipped</Badge>}
              {failed > 0 && <Badge className="bg-destructive/10 text-destructive">{failed} errors</Badge>}
            </div>
            <div className="max-h-[340px] overflow-auto rounded-md border border-border scrollbar-thin">
              <table className="table-base">
                <thead className="sticky top-0 bg-card">
                  <tr>
                    <th className="w-12">Row</th>
                    <th>Title</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row) => (
                    <tr key={`${row.row}-${row.title}`}>
                      <td className="text-[11px] tabular-nums text-muted-foreground">{row.row}</td>
                      <td>
                        <p className="text-[12.5px] font-medium">{row.title || "—"}</p>
                        {row.message && <p className="mt-0.5 text-[11px] text-muted-foreground">{row.message}</p>}
                      </td>
                      <td>
                        {row.status === "ready" && <span className="inline-flex items-center gap-1 text-[11.5px] text-success"><CheckCircle2 className="h-3 w-3" /> Ready</span>}
                        {row.status === "duplicate" && <span className="inline-flex items-center gap-1 text-[11.5px] text-warning"><TriangleAlert className="h-3 w-3" /> Duplicate</span>}
                        {row.status === "error" && <span className="inline-flex items-center gap-1 text-[11.5px] text-destructive"><XCircle className="h-3 w-3" /> Error</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Importing runs as a background job. Keep the worker process running while it completes.
            </p>
          </div>
        )}

        {phase === "committing" && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">Importing your library…</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Job status: {jobStatus}. This usually takes a few seconds.
            </p>
            {waited > 12 && (
              <p className="mt-4 max-w-sm rounded-md bg-warning/10 px-3 py-2 text-[11.5px] leading-5 text-warning">
                Still queued. Is the background worker running? Start it with
                {" "}<code className="font-mono">python -m app.tasks.worker</code> and the job will pick up automatically.
              </p>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            {jobError ? (
              <>
                <XCircle className="h-7 w-7 text-destructive" />
                <p className="mt-3 text-sm font-medium">Import failed</p>
                <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">{jobError}</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-7 w-7 text-success" />
                <p className="mt-3 text-sm font-medium">Your books are in.</p>
                <p className="mt-1 text-[12px] text-muted-foreground">The library and analytics have been refreshed.</p>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
