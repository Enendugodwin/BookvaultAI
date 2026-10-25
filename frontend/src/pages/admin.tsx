import { useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Ban,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  MailCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AdminUser } from "@/lib/types";
import { cn, formatDateTime, formatMinutes, formatNumber, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold leading-none">{value}</p>
      {hint && <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AccountActions({ user, currentUserId, onUpdate, onRevoke, onDelete, busy }: {
  user: AdminUser;
  currentUserId: string;
  onUpdate: (id: string, payload: { is_active?: boolean; is_admin?: boolean; email_verified?: boolean }) => void;
  onRevoke: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  busy: boolean;
}) {
  const isSelf = user.id === currentUserId;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={busy || isSelf}
        onClick={() => onUpdate(user.id, { is_admin: !user.is_admin })}
        title={user.is_admin ? "Remove administrator access" : "Make administrator"}
        aria-label={user.is_admin ? `Remove administrator access from ${user.display_name}` : `Make ${user.display_name} an administrator`}
      >
        {user.is_admin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={busy || isSelf}
        onClick={() => onUpdate(user.id, { is_active: !user.is_active })}
        title={user.is_active ? "Suspend account" : "Reactivate account"}
        aria-label={user.is_active ? `Suspend ${user.display_name}` : `Reactivate ${user.display_name}`}
      >
        {user.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
      </Button>
      {!user.email_verified && (
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={() => onUpdate(user.id, { email_verified: true })}
          title="Mark email as verified"
          aria-label={`Mark ${user.display_name} as email verified`}
        >
          <MailCheck className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        disabled={busy || isSelf}
        onClick={() => onRevoke(user)}
        title="Sign out all sessions"
        aria-label={`Sign out all sessions for ${user.display_name}`}
      >
        <Clock3 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={busy || isSelf}
        onClick={() => onDelete(user)}
        title="Delete account"
        aria-label={`Delete ${user.display_name}`}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<AdminUser | null>(null);

  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: api.admin.overview });
  const users = useQuery({
    queryKey: ["admin", "users", deferredSearch, status, role, page],
    queryFn: () => api.admin.users({
      q: deferredSearch,
      status,
      role,
      page,
      page_size: 15,
    }),
  });
  const activity = useQuery({
    queryKey: ["admin", "activity"],
    queryFn: () => api.admin.activity(30),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  const updateUser = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { is_active?: boolean; is_admin?: boolean; email_verified?: boolean } }) =>
      api.admin.updateUser(id, payload),
    onSuccess: (result) => {
      toast.success("Account updated", `${result.user.email} was updated.`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error("Could not update account", error instanceof ApiError ? error.message : undefined),
  });

  const revokeSessions = useMutation({
    mutationFn: (user: AdminUser) => api.admin.revokeSessions(user.id),
    onSuccess: (result, user) => {
      toast.success("Sessions signed out", `${user.display_name}: ${result.revoked} session(s) revoked.`);
      setConfirmRevoke(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error("Could not revoke sessions", error instanceof ApiError ? error.message : undefined),
  });

  const removeUser = useMutation({
    mutationFn: (user: AdminUser) => api.admin.removeUser(user.id),
    onSuccess: (_result, user) => {
      toast.success("Account deleted", `${user.email} and their personal data were removed.`);
      setConfirmDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error("Could not delete account", error instanceof ApiError ? error.message : undefined),
  });

  const busy = updateUser.isPending || revokeSessions.isPending || removeUser.isPending;
  const totalUsers = overview.data?.totals.users;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Admin portal"
        description="Monitor accounts, reading activity and background jobs. Changes are audited and take effect immediately."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} loading={overview.isFetching || users.isFetching}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {overview.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
      ) : overview.isError || !overview.data ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">Could not load administrator metrics.</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Accounts"
              value={formatNumber(overview.data.totals.users)}
              hint={`${overview.data.totals.active_users} active · ${overview.data.totals.admins} admin`}
            />
            <Stat
              label="Active this week"
              value={formatNumber(overview.data.totals.active_users_7d)}
              hint={`${overview.data.totals.new_users_7d} joined in the last 7 days`}
            />
            <Stat
              label="Reading logged"
              value={formatMinutes(overview.data.totals.reading_minutes)}
              hint={`${formatNumber(overview.data.totals.books)} books · ${formatNumber(overview.data.totals.sessions)} sessions`}
            />
            <Stat
              label="Attention"
              value={formatNumber(overview.data.jobs.failed ?? 0)}
              hint={`${overview.data.jobs.queued ?? 0} queued · ${overview.data.jobs.running ?? 0} running · ${overview.data.totals.suspended_users} suspended`}
            />
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <Badge className="bg-muted text-muted-foreground"><Users className="h-3 w-3" /> {overview.data.totals.verified_users} verified emails</Badge>
            <Badge className="bg-muted text-muted-foreground"><BookOpenCheck className="h-3 w-3" /> {formatNumber(overview.data.totals.notes)} notes</Badge>
            <Badge className="bg-muted text-muted-foreground"><Activity className="h-3 w-3" /> {formatNumber(overview.data.totals.highlights)} highlights</Badge>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Metrics refreshed {relativeTime(overview.data.generated_at)}</span>
          </div>
        </>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Accounts</CardTitle>
                <CardDescription>{totalUsers ? `${formatNumber(totalUsers)} registered accounts` : "Search and manage every account."}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[180px] flex-1 sm:flex-none">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    placeholder="Search name or email"
                    className="pl-8"
                    aria-label="Search accounts"
                  />
                </div>
                <Select
                  value={status}
                  onChange={(event) => { setStatus(event.target.value); setPage(1); }}
                  aria-label="Filter by account status"
                  className="w-auto"
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="disabled">Suspended</option>
                </Select>
                <Select
                  value={role}
                  onChange={(event) => { setRole(event.target.value); setPage(1); }}
                  aria-label="Filter by role"
                  className="w-auto"
                >
                  <option value="all">All roles</option>
                  <option value="admin">Admins</option>
                  <option value="user">Readers</option>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {users.isLoading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14" />)}
              </div>
            ) : users.isError ? (
              <p className="px-5 py-8 text-sm text-destructive">Could not load accounts.</p>
            ) : !users.data?.items.length ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No accounts match these filters.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Status</th>
                        <th>Reading</th>
                        <th>Last seen</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.data.items.map((user) => (
                        <tr key={user.id} className={cn(!user.is_active && "opacity-60")}>
                          <td>
                            <div className="flex min-w-[190px] items-center gap-2.5">
                              <Avatar name={user.display_name} className="h-8 w-8" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-[13px] font-medium">{user.display_name}</p>
                                  {user.is_admin && <ShieldCheck className="h-3 w-3 text-primary" aria-label="Administrator" />}
                                  {user.is_demo && <Badge className="bg-muted px-1.5 text-[9px]">demo</Badge>}
                                </div>
                                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-col items-start gap-1">
                              <Badge className={user.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                                {user.is_active ? "Active" : "Suspended"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {user.email_verified ? "Verified" : "Unverified"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <p className="text-[12px]">{formatMinutes(user.reading_minutes)}</p>
                            <p className="text-[10px] text-muted-foreground">{user.book_count} books ? {user.session_count} sessions</p>
                          </td>
                          <td>
                            <p className="text-[12px]">{relativeTime(user.last_login_at)}</p>
                            <p className="text-[10px] text-muted-foreground">{user.active_sessions} device(s)</p>
                          </td>
                          <td>
                            <div className="flex justify-end">
                              <AccountActions
                                user={user}
                                currentUserId={currentUser?.id ?? ""}
                                onUpdate={(id, payload) => updateUser.mutate({ id, payload })}
                                onRevoke={setConfirmRevoke}
                                onDelete={setConfirmDelete}
                                busy={busy}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-border/60 md:hidden">
                  {users.data.items.map((user) => (
                    <div key={user.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={user.display_name} className="h-8 w-8" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{user.display_name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                        <Badge className={user.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                          {user.is_active ? "Active" : "Suspended"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
                        <span>{user.is_admin ? "Administrator" : "Reader"}</span>
                        <span>{user.book_count} books</span>
                        <span>{formatMinutes(user.reading_minutes)}</span>
                        <span>{user.active_sessions} device(s)</span>
                        <span>seen {relativeTime(user.last_login_at)}</span>
                      </div>
                      <div className="mt-2">
                        <AccountActions
                          user={user}
                          currentUserId={currentUser?.id ?? ""}
                          onUpdate={(id, payload) => updateUser.mutate({ id, payload })}
                          onRevoke={setConfirmRevoke}
                          onDelete={setConfirmDelete}
                          busy={busy}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
              <p className="text-[11px] text-muted-foreground">
                Page {users.data?.page ?? 1} of {users.data?.pages ?? 1}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!users.data || page >= users.data.pages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Recent activity</CardTitle>
            <CardDescription>Administrative and account events.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[620px] space-y-3 overflow-y-auto">
            {activity.isLoading ? (
              Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)
            ) : !activity.data?.items.length ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No activity recorded yet.</p>
            ) : (
              activity.data.items.map((item) => (
                <div key={item.id} className="flex gap-2.5 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserRoundCheck className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-medium leading-4">{item.action.replaceAll(".", " ? ")}</p>
                    <p className="truncate text-[10.5px] text-muted-foreground">{item.email ?? "Deleted account"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">{formatDateTime(item.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this account?"
        description={confirmDelete ? `Permanently delete ${confirmDelete.email} and all of their books, sessions, notes and exports. This cannot be undone.` : ""}
        confirmLabel="Delete account"
        destructive
        loading={removeUser.isPending}
        onConfirm={() => { if (confirmDelete) removeUser.mutate(confirmDelete); }}
        onClose={() => setConfirmDelete(null)}
      />
      <ConfirmDialog
        open={Boolean(confirmRevoke)}
        title="Sign out every device?"
        description={confirmRevoke ? `Revoke all active sessions for ${confirmRevoke.email}. They can sign in again.` : ""}
        confirmLabel="Sign out sessions"
        loading={revokeSessions.isPending}
        onConfirm={() => { if (confirmRevoke) revokeSessions.mutate(confirmRevoke); }}
        onClose={() => setConfirmRevoke(null)}
      />
    </div>
  );
}
