import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CheckCheck, Mail, Send, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Notification, ReportPreview } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [reportPeriod, setReportPeriod] = useState<"week" | "month" | null>(null);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [showEmailHelp, setShowEmailHelp] = useState(false);

  const notifications = useQuery({
    queryKey: ["notifications", unreadOnly, page],
    queryFn: () => api.notifications.list({ unread_only: unreadOnly, page, page_size: 20 }),
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: refresh,
  });

  const markAll = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      refresh();
      toast.success("All notifications marked read");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.notifications.remove(id),
    onSuccess: refresh,
    onError: (err) => toast.error("Could not remove notification", err instanceof ApiError ? err.message : undefined),
  });

  const testEmail = useMutation({
    mutationFn: () => api.notifications.testEmail(),
    onSuccess: () => toast.success("Test email queued", "The background worker will deliver it if email is configured."),
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Could not queue the test email.";
      setShowEmailHelp(true);
      toast.error("Test email not sent", message);
    },
  });

  async function openReport(period: "week" | "month") {
    setReportPeriod(period);
    setPreview(null);
    try {
      const result = await api.notifications.reportPreview(period);
      setPreview(result);
    } catch (err) {
      toast.error("Could not build report preview", err instanceof ApiError ? err.message : undefined);
      setReportPeriod(null);
    }
  }

  const sendReport = useMutation({
    mutationFn: () => api.notifications.sendReport(reportPeriod!),
    onSuccess: () => {
      toast.success("Report queued", "It will be emailed when the worker runs.");
      setReportPeriod(null);
      refresh();
    },
    onError: (err) => toast.error("Could not queue report", err instanceof ApiError ? err.message : undefined),
  });

  const unread = notifications.data?.unread ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Reminders, milestones and reports. Everything is also stored here, so nothing is lost if email is off."
        actions={
          <>
            <Button variant="outline" onClick={() => testEmail.mutate()} loading={testEmail.isPending}>
              <Mail className="h-4 w-4" /> Test email
            </Button>
            <Button onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={unread === 0 || unreadOnly}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          </>
        }
      />

      {showEmailHelp && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-4">
          <p className="text-[13px] font-semibold">Email delivery is not configured on this deployment</p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Set <code className="font-mono text-[11px]">RESEND_API_KEY</code> and{" "}
            <code className="font-mono text-[11px]">EMAIL_FROM</code> in the backend environment to enable outbound email.
            In-app notifications keep working without it.
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowEmailHelp(false)}>Dismiss</Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              tabs={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread", count: unread },
              ]}
              value={unreadOnly ? "unread" : "all"}
              onChange={(value) => { setUnreadOnly(value === "unread"); setPage(1); }}
            />
            <span className="text-[11.5px] text-muted-foreground">{notifications.data?.total ?? 0} total</span>
          </div>

          {notifications.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          ) : notifications.data?.items.length ? (
            <div className="space-y-2">
              {notifications.data.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onRead={() => markRead.mutate(item.id)}
                  onDelete={() => remove.mutate(item.id)}
                />
              ))}
              {(notifications.data.pages ?? 1) > 1 && (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</Button>
                  <span className="text-[12px] text-muted-foreground">{page} / {notifications.data.pages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(notifications.data?.pages ?? 1, value + 1))} disabled={page === (notifications.data?.pages ?? 1)}>Next</Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Bell}
              title={unreadOnly ? "You are all caught up" : "No notifications yet"}
              description="Reading reminders, streak milestones and weekly summaries will appear here."
              action={unreadOnly ? <Button variant="outline" onClick={() => setUnreadOnly(false)}>View all</Button> : undefined}
            />
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Reading reports</CardTitle>
            <p className="text-[12px] leading-5 text-muted-foreground">
              A summary of your reading, generated from recorded sessions. Preview it before sending.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => void openReport("week")}>
              <Send className="h-4 w-4" /> Weekly report
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => void openReport("month")}>
              <Send className="h-4 w-4" /> Monthly report
            </Button>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium"><BellRing className="h-3.5 w-3.5" /> Reminder emails</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Reminder time and days are configured in Settings. Email requires the server to have Resend configured.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(reportPeriod)}
        onClose={() => setReportPeriod(null)}
        title={reportPeriod === "week" ? "Weekly report preview" : "Monthly report preview"}
        description="This is exactly what will be included in the email."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReportPeriod(null)} disabled={sendReport.isPending}>Cancel</Button>
            <Button
              onClick={() => sendReport.mutate()}
              loading={sendReport.isPending}
              disabled={!preview?.email_configured || !preview?.email_enabled_by_user}
            >
              <Send className="h-4 w-4" /> Send report
            </Button>
          </>
        }
      >
        {!preview ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-3">
            <h3 className="font-display text-lg font-semibold">{preview.title}</h3>
            <div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border">
              {preview.rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 text-[12.5px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{value}</span>
                </div>
              ))}
            </div>
            {!preview.email_configured && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-[11.5px] leading-5 text-warning">
                Email is not configured on this server, so sending is disabled. Set RESEND_API_KEY and EMAIL_FROM to enable it.
              </p>
            )}
            {preview.email_configured && !preview.email_enabled_by_user && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-[11.5px] leading-5 text-warning">
                Email notifications are turned off in your settings. Enable them in Settings → Notifications.
              </p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function NotificationRow({ item, onRead, onDelete }: { item: Notification; onRead: () => void; onDelete: () => void }) {
  return (
    <div className={cn("surface flex items-start gap-3 p-3.5", !item.read && "border-primary/30 bg-primary/[0.03]")}>
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", item.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
        <Bell className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-semibold">{item.title}</p>
          {!item.read && <Badge className="bg-primary/10 text-[9.5px] text-primary">New</Badge>}
          <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{item.category.replaceAll("_", " ")}</span>
        </div>
        <p className="mt-1 text-[12px] leading-6 text-foreground/80">{item.body}</p>
        <p className="mt-1 text-[10.5px] text-muted-foreground" title={formatDateTime(item.created_at)}>{relativeTime(item.created_at)}</p>
      </div>
      <div className="flex shrink-0 gap-0.5">
        {!item.read && (
          <Button variant="ghost" size="icon" onClick={onRead} aria-label="Mark read">
            <CheckCheck className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete notification">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
