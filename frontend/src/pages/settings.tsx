import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, Bot, Database, Download, KeyRound, Palette, Plus, ShieldCheck,
  Sparkles, Trash2, Upload, UserRound,
} from "lucide-react";
import { api, ApiError, downloadExport } from "@/lib/api";
import type { UserSettings } from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth";
import { useTheme } from "@/context/theme";
import { ImportDialog } from "@/components/data/import-dialog";
import { ExportDialog } from "@/components/data/export-dialog";
import { THEMES } from "@/lib/themes";

type SettingsTab = "profile" | "appearance" | "notifications" | "ai" | "data" | "security";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(user?.settings ?? null);

  useEffect(() => {
    if (user) {
      setSettings(user.settings);
      setDisplayName(user.display_name);
    }
  }, [user]);

  useEffect(() => {
    if (user?.settings.theme && user.settings.theme !== theme) setTheme(user.settings.theme);
    // Only reconcile on mount / user change; local theme switching is immediate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const facets = useQuery({ queryKey: ["facets"], queryFn: api.books.facets, staleTime: 60_000 });
  const aiStatus = useQuery({ queryKey: ["ai", "status"], queryFn: api.ai.status });
  const sessions = useQuery({ queryKey: ["auth", "sessions"], queryFn: api.auth.sessions, enabled: tab === "security" });
  const imports = useQuery({ queryKey: ["imports"], queryFn: api.imports.list, enabled: tab === "data" });
  const exports = useQuery({ queryKey: ["exports"], queryFn: api.exports.list, enabled: tab === "data" });

  const saveSettings = useMutation({
    mutationFn: (payload: Partial<UserSettings>) => api.auth.updateSettings(payload),
    onSuccess: (result) => {
      setUser(result.user);
      setSettings(result.user.settings);
      if (result.user.settings.theme !== theme) setTheme(result.user.settings.theme);
      void queryClient.invalidateQueries({ queryKey: ["summary"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Settings saved");
    },
    onError: (err) => toast.error("Could not save settings", err instanceof ApiError ? err.message : undefined),
  });

  const saveProfile = useMutation({
    mutationFn: () => api.auth.updateProfile(displayName.trim()),
    onSuccess: (result) => {
      setUser(result.user);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated");
    },
    onError: (err) => toast.error("Could not update profile", err instanceof ApiError ? err.message : undefined),
  });

  const changePassword = useMutation({
    mutationFn: () => api.auth.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError(null);
      toast.success("Password changed", "Other sessions have been revoked.");
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
    },
    onError: (err) => setPasswordError(err instanceof ApiError ? err.message : "Could not change password."),
  });

  const resendVerification = useMutation({
    mutationFn: api.auth.resendVerification,
    onSuccess: () => toast.success("Verification email queued"),
    onError: (err) => toast.error("Could not send verification", err instanceof ApiError ? err.message : undefined),
  });

  const revokeAll = useMutation({
    mutationFn: api.auth.revokeAll,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      toast.success("Other sessions revoked");
    },
  });

  const testAi = useMutation({
    mutationFn: api.ai.test,
    onSuccess: (result) => {
      if (result.ok) toast.success("AI connection works", result.model);
      else toast.error("AI connection failed", result.message);
    },
    onError: (err) => toast.error("AI connection failed", err instanceof ApiError ? err.message : undefined),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.auth.deleteAccount(deletePassword),
    onSuccess: async () => {
      toast.success("Account deleted");
      await logout();
    },
    onError: (err) => toast.error("Could not delete account", err instanceof ApiError ? err.message : undefined),
  });

  const removeExport = useMutation({
    mutationFn: (id: string) => api.exports.remove(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["exports"] }),
  });

  if (!user || !settings) {
    return <Skeleton className="h-96 rounded-lg" />;
  }

  const update = (patch: Partial<UserSettings>) => setSettings((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your profile, how YVO's Book Vault behaves, and what leaves this server."
      />

      <div className="grid gap-6 lg:grid-cols-[190px_1fr]">
        <nav className="flex flex-wrap gap-1 lg:flex-col" aria-label="Settings sections">
          {[
            { value: "profile" as const, label: "Profile", icon: UserRound },
            { value: "appearance" as const, label: "Appearance", icon: Palette },
            { value: "notifications" as const, label: "Notifications", icon: Bell },
            { value: "ai" as const, label: "AI & privacy", icon: Bot },
            { value: "data" as const, label: "Data", icon: Database },
            { value: "security" as const, label: "Security", icon: ShieldCheck },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-left text-[12.5px] font-medium transition-colors",
                tab === item.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              aria-current={tab === item.value ? "page" : undefined}
            >
              <item.icon className="h-3.5 w-3.5" /> {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-5">
          {tab === "profile" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>How you appear inside your own library.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="display-name">Display name</Label>
                    <div className="flex gap-2">
                      <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} />
                      <Button onClick={() => saveProfile.mutate()} loading={saveProfile.isPending} disabled={!displayName.trim() || displayName.trim() === user.display_name}>
                        Save
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium">{user.email}</p>
                      <Badge className={user.email_verified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>
                        {user.email_verified ? "Verified" : "Unverified"}
                      </Badge>
                      {!user.email_verified && (
                        <Button variant="ghost" size="sm" onClick={() => resendVerification.mutate()} loading={resendVerification.isPending}>
                          Resend verification
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">Member since {formatDate(user.created_at)}.</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Password</CardTitle>
                  <CardDescription>Changing your password revokes all other sessions.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      changePassword.mutate();
                    }}
                  >
                    {passwordError && <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">{passwordError}</div>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="current-password">Current password</Label>
                        <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
                      </div>
                      <div>
                        <Label htmlFor="new-password" hint="min. 8 characters">New password</Label>
                        <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
                      </div>
                    </div>
                    <Button type="submit" variant="outline" loading={changePassword.isPending} disabled={!currentPassword || newPassword.length < 8}>
                      <KeyRound className="h-4 w-4" /> Update password
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </>
          )}

          {tab === "appearance" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Theme</CardTitle>
                  <CardDescription>Follow the system or pin a reading light.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {THEMES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setTheme(option.value);
                          update({ theme: option.value });
                          saveSettings.mutate({ theme: option.value });
                        }}
                        className={cn(
                          "rounded-md border p-3 text-left transition-colors",
                          theme === option.value ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-foreground/25",
                        )}
                        aria-pressed={theme === option.value}
                      >
                        <span className="mb-2 flex overflow-hidden rounded-sm border border-black/10">
                          {option.swatch.map((color, index) => (
                            <span key={index} className="h-5 flex-1" style={{ backgroundColor: color }} />
                          ))}
                        </span>
                        <p className="text-[13px] font-medium">{option.label}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Library display</CardTitle>
                  <CardDescription>These preferences are stored with your account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="page-size">Books per page</Label>
                      <Select id="page-size" value={settings.page_size} onChange={(event) => update({ page_size: Number(event.target.value) })}>
                        {[12, 24, 36, 48, 60].map((value) => <option key={value} value={value}>{value}</option>)}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="library-view">Default view</Label>
                      <Select id="library-view" value={settings.library_view} onChange={(event) => update({ library_view: event.target.value as UserSettings["library_view"] })}>
                        <option value="grid">Grid</option>
                        <option value="table">Table</option>
                        <option value="compact">Compact</option>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="genres" hint="comma separated">Preferred genres</Label>
                    <Input
                      id="genres"
                      value={settings.preferred_genres.join(", ")}
                      onChange={(event) => update({ preferred_genres: event.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 30) })}
                      placeholder="History, Philosophy, Science"
                    />
                    {facets.data?.genres.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {facets.data.genres.slice(0, 8).map((genre) => (
                          <button
                            key={genre.name}
                            type="button"
                            onClick={() => {
                              if (settings.preferred_genres.includes(genre.name)) return;
                              update({ preferred_genres: [...settings.preferred_genres, genre.name].slice(0, 30) });
                            }}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="mr-0.5 inline h-2.5 w-2.5" /> {genre.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="timezone">Timezone</Label>
                    <Input id="timezone" value={settings.timezone} onChange={(event) => update({ timezone: event.target.value })} placeholder="Europe/Vienna" />
                    <p className="mt-1 text-[11px] text-muted-foreground">Used for streaks, daily caps and reminders. Must be an IANA timezone name.</p>
                  </div>
                  <Button onClick={() => saveSettings.mutate(settings)} loading={saveSettings.isPending}>Save preferences</Button>
                </CardContent>
              </Card>
            </>
          )}

          {tab === "notifications" && (
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>In-app notifications always work. Email requires the server to be configured.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { key: "notify_inapp" as const, label: "In-app notifications", description: "Reminders and milestones appear in your inbox." },
                  { key: "notify_email" as const, label: "Email notifications", description: "Send reminders to your account email." },
                  { key: "weekly_summary" as const, label: "Weekly summary", description: "A recap of pages, time and books each week." },
                  { key: "monthly_report" as const, label: "Monthly report", description: "A longer reflection at the start of each month." },
                ].map((toggle) => (
                  <ToggleRow
                    key={toggle.key}
                    label={toggle.label}
                    description={toggle.description}
                    checked={Boolean(settings[toggle.key])}
                    onChange={(value) => update({ [toggle.key]: value } as Partial<UserSettings>)}
                  />
                ))}
                <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="reminder-time">Reminder time</Label>
                    <Input id="reminder-time" type="time" value={settings.reminder_time} onChange={(event) => update({ reminder_time: event.target.value })} />
                  </div>
                  <div>
                    <Label>Reminder days</Label>
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAYS.map((day, index) => {
                        const active = settings.reminder_days.includes(index);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => update({
                              reminder_days: active
                                ? settings.reminder_days.filter((value) => value !== index)
                                : [...settings.reminder_days, index].sort(),
                            })}
                            className={cn(
                              "h-8 w-10 rounded-md border text-[11px] font-medium transition-colors",
                              active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-foreground/30",
                            )}
                            aria-pressed={active}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <Button onClick={() => saveSettings.mutate(settings)} loading={saveSettings.isPending}>Save notifications</Button>
              </CardContent>
            </Card>
          )}

          {tab === "ai" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI features</CardTitle>
                  <CardDescription>AI is optional and off by default. Your books and notes are never used for training.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md border border-border/70 bg-muted/30 p-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <Badge className={aiStatus.data?.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
                        {aiStatus.data?.enabled ? "Enabled on server" : "Disabled on server"}
                      </Badge>
                      {aiStatus.data?.provider && <span className="text-muted-foreground">{aiStatus.data.provider} · {aiStatus.data.model}</span>}
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-5 text-muted-foreground">{aiStatus.data?.message}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => testAi.mutate()} loading={testAi.isPending} disabled={!aiStatus.data?.enabled}>
                      Test connection
                    </Button>
                  </div>
                  <ToggleRow
                    label="Enable AI features"
                    description="Summaries, chat, insights and recommendations."
                    checked={settings.ai_enabled}
                    onChange={(value) => update({ ai_enabled: value })}
                  />
                  <ToggleRow
                    label="Allow external AI processing"
                    description="Required when the configured provider is not running locally. Without consent, external providers are never called."
                    checked={settings.ai_external_consent}
                    onChange={(value) => update({ ai_external_consent: value })}
                  />
                  <div className="rounded-md border border-border/70 p-3.5">
                    <p className="text-[12px] font-medium">What is sent to the provider</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11.5px] leading-5 text-muted-foreground">
                      <li>Book metadata and the text you explicitly ask about</li>
                      <li>Your notes and highlights relevant to a request</li>
                      <li>Text from documents you upload for AI use</li>
                    </ul>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Passwords, session tokens and payment data are never sent.</p>
                  </div>
                  <Button onClick={() => saveSettings.mutate({ ai_enabled: settings.ai_enabled, ai_external_consent: settings.ai_external_consent })} loading={saveSettings.isPending}>
                    Save AI preferences
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {tab === "data" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Your data</CardTitle>
                  <CardDescription>Import, export and inspect what YVO's Book Vault holds. You own all of it.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import books</Button>
                  <Button variant="outline" onClick={() => setExportOpen(true)}><Download className="h-4 w-4" /> Export data</Button>
                  <a
                    href={api.imports.templateUrl}
                    className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-[12.5px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    CSV template
                  </a>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Import history</CardTitle></CardHeader>
                <CardContent>
                  {imports.isLoading ? <Skeleton className="h-20" /> : imports.data?.items.length ? (
                    <div className="space-y-2">
                      {imports.data.items.map((job) => (
                        <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-medium">{job.filename}</p>
                            <p className="text-[10.5px] text-muted-foreground">
                              {formatDateTime(job.created_at)} · {job.imported_rows} imported · {job.skipped_rows} skipped
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={job.status === "completed" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{job.status}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete import record"
                              onClick={() => api.imports.remove(job.id).then(() => queryClient.invalidateQueries({ queryKey: ["imports"] }))}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-3 text-[12px] text-muted-foreground">No imports yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Export history</CardTitle></CardHeader>
                <CardContent>
                  {exports.isLoading ? <Skeleton className="h-20" /> : exports.data?.items.length ? (
                    <div className="space-y-2">
                      {exports.data.items.map((job) => (
                        <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                          <div>
                            <p className="text-[12.5px] font-medium">{job.filename ?? job.format.replaceAll("_", " ")}</p>
                            <p className="text-[10.5px] text-muted-foreground">
                              {formatDateTime(job.created_at)}{job.expires_at ? ` · expires ${formatDate(job.expires_at)}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={job.status === "ready" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{job.status}</Badge>
                            {job.status === "ready" && job.downloadable && (
                              <Button variant="outline" size="sm" onClick={() => void downloadExport(job.id, job.filename ?? "bookvault-export")}>
                                <Download className="h-3.5 w-3.5" /> Download
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" aria-label="Delete export" onClick={() => removeExport.mutate(job.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-3 text-[12px] text-muted-foreground">No exports yet.</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {tab === "security" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Active sessions</CardTitle>
                  <CardDescription>Sessions are server-side and can be revoked at any time.</CardDescription>
                </CardHeader>
                <CardContent>
                  {sessions.isLoading ? <Skeleton className="h-24" /> : sessions.data?.items.length ? (
                    <div className="space-y-2">
                      {sessions.data.items.map((session) => (
                        <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-medium">
                              {session.user_agent ?? "Unknown device"}
                              {session.current && <Badge className="ml-2 bg-success/10 text-[9.5px] text-success">This device</Badge>}
                            </p>
                            <p className="text-[10.5px] text-muted-foreground">
                              Last seen {formatDateTime(session.last_seen_at)} · expires {formatDate(session.expires_at)}
                            </p>
                          </div>
                          {session.revoked && <Badge className="bg-muted text-muted-foreground">Revoked</Badge>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-3 text-[12px] text-muted-foreground">No other sessions.</p>
                  )}
                  <Button variant="outline" className="mt-3" onClick={() => revokeAll.mutate()} loading={revokeAll.isPending}>
                    Revoke all other sessions
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-destructive/30">
                <CardHeader>
                  <CardTitle className="text-destructive">Delete account</CardTitle>
                  <CardDescription>This permanently deletes your books, sessions, notes and conversations. It cannot be undone.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>Delete my account</Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <Dialog
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeletePassword(""); }}
        title="Delete your account permanently?"
        description="Every book, session, note, highlight, goal, journal entry and conversation will be erased."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteAccount.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteAccount.mutate()} loading={deleteAccount.isPending} disabled={!deletePassword}>
              Delete forever
            </Button>
          </>
        }
      >
        <div>
          <Label htmlFor="delete-password">Confirm your password</Label>
          <Input id="delete-password" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" />
        </div>
      </Dialog>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border/60 px-3.5 py-3">
      <div>
        <p className="text-[12.5px] font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </div>
  );
}
