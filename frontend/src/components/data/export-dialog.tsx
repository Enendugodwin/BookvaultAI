import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileArchive, FileJson, FileSpreadsheet, FileText, Loader2, XCircle } from "lucide-react";
import { api, ApiError, downloadExport } from "@/lib/api";
import type { ExportJob } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";

const FORMATS = [
  { value: "library_csv", label: "Library CSV", description: "All books and shelves for spreadsheets.", icon: FileSpreadsheet },
  { value: "library_json", label: "Library JSON", description: "Complete metadata, portable and structured.", icon: FileJson },
  { value: "sessions_csv", label: "Sessions CSV", description: "Every reading session with time and pages.", icon: FileSpreadsheet },
  { value: "notes_md", label: "Notes & highlights", description: "Markdown document of your knowledge base.", icon: FileText },
  { value: "report_pdf", label: "Reading report PDF", description: "A designed summary you can keep or share.", icon: FileText },
  { value: "archive_zip", label: "Full archive", description: "Everything above in one ZIP, including data files.", icon: FileArchive },
];

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [format, setFormat] = useState("library_csv");
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) {
      setExportJob(null);
      setError(null);
      setFormat("library_csv");
    }
  }, [open]);

  useEffect(() => {
    if (!exportJob || exportJob.status !== "queued") return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const latest = await api.exports.get(exportJob.id);
        if (cancelled) return;
        setExportJob(latest);
        if (latest.status === "ready") {
          toast.success("Export ready", "Download it below.");
          void queryClient.invalidateQueries({ queryKey: ["exports"] });
        }
        if (latest.status === "failed") {
          setError("The export failed. Try a different format.");
          void queryClient.invalidateQueries({ queryKey: ["exports"] });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not check export status.");
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [exportJob, toast, queryClient]);

  const create = useMutation({
    mutationFn: () => api.exports.create(format),
    onSuccess: (result) => {
      setError(null);
      setExportJob({
        id: result.id,
        format,
        status: result.status,
        filename: null,
        size_bytes: null,
        created_at: new Date().toISOString(),
        expires_at: null,
        downloadable: false,
      });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create the export."),
  });

  async function handleDownload() {
    if (!exportJob) return;
    setDownloading(true);
    try {
      await downloadExport(exportJob.id, exportJob.filename ?? `bookvault-export.${exportJob.format}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  const selected = FORMATS.find((item) => item.value === format);
  const busy = create.isPending || exportJob?.status === "queued";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export your data"
      description="Exports are generated in the background and expire after a short window. You own your data."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {exportJob?.status === "ready" && exportJob.downloadable ? (
            <Button onClick={() => void handleDownload()} loading={downloading}>
              <Download className="h-4 w-4" /> Download {exportJob.filename ?? "file"}
            </Button>
          ) : (
            <Button onClick={() => create.mutate()} loading={busy}>
              {exportJob?.status === "queued" ? "Preparing export…" : "Create export"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">{error}</div>}

        {!exportJob ? (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Export format">
            {FORMATS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={format === item.value}
                onClick={() => setFormat(item.value)}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                  format === item.value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/25",
                )}
              >
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-[13px] font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-5 text-muted-foreground">{item.description}</span>
                </span>
              </button>
            ))}
          </div>
        ) : exportJob.status === "ready" ? (
          <div className="rounded-md border border-success/25 bg-success/5 p-5 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-success" />
            <p className="mt-2 text-sm font-semibold">Export ready</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {selected?.label} · generated {formatDate(exportJob.created_at)}
              {exportJob.expires_at ? ` · expires ${formatDate(exportJob.expires_at)}` : ""}
            </p>
          </div>
        ) : exportJob.status === "failed" ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/5 p-5 text-center">
            <XCircle className="mx-auto h-7 w-7 text-destructive" />
            <p className="mt-2 text-sm font-semibold">Export failed</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setExportJob(null)}>Try again</Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium">Preparing {selected?.label.toLowerCase()}…</p>
            <p className="mt-1 text-[12px] text-muted-foreground">This runs in the background worker.</p>
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setExportJob(null)}>
              Choose another format
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
