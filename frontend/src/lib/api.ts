import type {
  AIInsight,
  ImportPreview,
  AIRecommendation,
  AIStatus,
  AISummary,
  AIDocument,
  AnalyticsOverview,
  AnalyticsSummary,
  AuthResponse,
  BackgroundJob,
  BookInput,
  CatalogueSearch,
  Conversation,
  ConversationDetail,
  CurrentlyReadingItem,
  ExportJob,
  Facets,
  Goal,
  GoalInput,
  Heatmap,
  Highlight,
  ImportJob,
  JournalEntry,
  KnowledgeOverview,
  KnowledgeSearch,
  LibraryResponse,
  Note,
  Notification,
  Paginated,
  ReadingSession,
  ReportPreview,
  SessionInfo,
  User,
  UserBook,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const API = `${BASE}/api/v1`;

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken() {
  return csrfToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export function qs(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const out = search.toString();
  return out ? `?${out}` : "";
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuthEvent?: boolean } = {},
): Promise<T> {
  const { skipAuthEvent, ...init } = options;
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  headers.set("Accept", "application/json");

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      method,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the server. Check your connection.");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const body = data as { error?: { code?: string; message?: string; details?: unknown } } | null;
    if (response.status === 401 && !skipAuthEvent) {
      csrfToken = null;
      window.dispatchEvent(new CustomEvent("bv:unauthorized"));
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? "request_failed",
      body?.error?.message ?? `Request failed (${response.status}).`,
      body?.error?.details,
    );
  }
  return data as T;
}

function get<T>(path: string) {
  return request<T>(path);
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

function del<T = void>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "DELETE",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const api = {
  auth: {
    register: (payload: { email: string; password: string; display_name: string }) =>
      post<AuthResponse>("/auth/register", payload),
    login: (payload: { email: string; password: string }) =>
      post<AuthResponse>("/auth/login", payload).then((r) => {
        if (r.user.csrf_token) setCsrfToken(r.user.csrf_token);
        return r;
      }),
    logout: () => post<{ message: string }>("/auth/logout"),
    me: () =>
      get<AuthResponse>("/auth/me").then((r) => {
        if (r.user.csrf_token) setCsrfToken(r.user.csrf_token);
        return r;
      }),
    forgot: (email: string) =>
      post<{ message: string; reset_token?: string }>("/auth/password/forgot", { email }),
    reset: (token: string, new_password: string) =>
      post<{ message: string }>("/auth/password/reset", { token, new_password }),
    changePassword: (current_password: string, new_password: string) =>
      post<{ message: string }>("/auth/password/change", { current_password, new_password }),
    verifyEmail: (token: string) => post<{ message: string }>("/auth/email/verify", { token }),
    resendVerification: () => post<{ message: string }>("/auth/email/resend"),
    updateProfile: (display_name: string) =>
      patch<AuthResponse>("/auth/profile", { display_name }),
    updateSettings: (payload: Partial<User["settings"]>) =>
      patch<AuthResponse>("/auth/settings", payload).then((r) => {
        if (r.user.csrf_token) setCsrfToken(r.user.csrf_token);
        return r;
      }),
    onboarding: (payload: {
      annual_goal?: number | null;
      genres?: string[];
      import_later?: boolean;
      reminder_time?: string;
      notify_email?: boolean;
      ai_consent?: boolean;
      skip?: boolean;
    }) => post<AuthResponse>("/auth/onboarding", payload),
    sessions: () => get<{ items: SessionInfo[] }>("/auth/sessions"),
    revokeAll: () => post<{ message: string }>("/auth/sessions/revoke-all"),
    deleteAccount: (password: string) =>
      del<{ message: string }>("/auth/account", { password }),
  },
  books: {
    list: (params: Record<string, QueryValue> = {}) =>
      get<LibraryResponse>(`/books${qs(params)}`),
    facets: () => get<Facets>("/books/facets"),
    get: (id: string) => get<UserBook>(`/books/${id}`),
    add: (payload: BookInput) => post<UserBook>("/books", payload),
    update: (id: string, payload: Partial<BookInput> & { archived?: boolean }) =>
      patch<UserBook>(`/books/${id}`, payload),
    remove: (id: string) => del(`/books/${id}`),
    progress: (id: string, current_page: number) =>
      post<UserBook>(`/books/${id}/progress`, { current_page }),
    complete: (id: string, payload: { rating?: number; review?: string }) =>
      post<{ book: UserBook; suggested_next: UserBook | null }>(`/books/${id}/complete`, payload),
    bulkStatus: (ids: string[], status: string) =>
      post<{ updated: number }>("/books/bulk-status", { ids, status }),
  },
  sessions: {
    list: (params: Record<string, QueryValue> = {}) =>
      get<Paginated<ReadingSession>>(`/sessions${qs(params)}`),
    create: (userBookId: string, payload: {
      started_at: string;
      ended_at: string;
      paused_seconds?: number;
      start_page?: number | null;
      end_page?: number | null;
      notes?: string | null;
    }, idempotencyKey?: string) =>
      request<ReadingSession>(`/books/${userBookId}/sessions`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      }),
    update: (id: string, payload: Partial<{
      started_at: string;
      ended_at: string;
      paused_seconds: number;
      start_page: number | null;
      end_page: number | null;
      notes: string | null;
    }>) => patch<ReadingSession>(`/sessions/${id}`, payload),
    remove: (id: string) => del(`/sessions/${id}`),
  },
  timer: {
    get: () => get<{ timer: import("./types").ActiveTimer | null }>("/timer"),
    start: (user_book_id: string, payload: { start_page?: number | null; notes?: string } = {}) =>
      post<{ timer: import("./types").ActiveTimer }>("/timer/start", { user_book_id, ...payload }),
    pause: () => post<{ timer: import("./types").ActiveTimer }>("/timer/pause"),
    resume: () => post<{ timer: import("./types").ActiveTimer }>("/timer/resume"),
    stop: (payload: { end_page?: number | null; notes?: string } = {}) =>
      post<{ session: ReadingSession; timer: null }>("/timer/stop", payload),
    cancel: () => del("/timer"),
  },
  goals: {
    list: (includeInactive = false) =>
      get<{ items: Goal[] }>(`/goals${qs({ include_inactive: includeInactive })}`),
    create: (payload: GoalInput) => post<Goal>("/goals", payload),
    update: (id: string, payload: Partial<GoalInput> & { is_active?: boolean }) =>
      patch<Goal>(`/goals/${id}`, payload),
    remove: (id: string) => del(`/goals/${id}`),
    recommendations: () => get<{ items: Goal[] }>("/goals/recommendations/current"),
  },
  analytics: {
    summary: () => get<AnalyticsSummary>("/analytics/summary"),
    overview: (params: Record<string, QueryValue> = {}) =>
      get<AnalyticsOverview>(`/analytics/overview${qs(params)}`),
    heatmap: (year?: number, metric = "pages") =>
      get<Heatmap>(`/analytics/heatmap${qs({ year, metric })}`),
    day: (day: string) =>
      get<{ date: string; sessions: ReadingSession[] }>(`/analytics/day${qs({ day })}`),
    currentlyReading: () => get<{ items: CurrentlyReadingItem[] }>("/analytics/currently-reading"),
  },
  catalogue: {
    search: (q: string, field = "all", limit = 20) =>
      get<CatalogueSearch>(`/catalogue/search${qs({ q, field, limit })}`),
    isbn: (isbn: string) => get<CatalogueSearch>(`/catalogue/isbn/${encodeURIComponent(isbn)}`),
  },
  notes: {
    list: (params: Record<string, QueryValue> = {}) =>
      get<Paginated<Note>>(`/notes${qs(params)}`),
    create: (payload: {
      title: string;
      content: string;
      user_book_id?: string | null;
      page_ref?: string | null;
      is_important?: boolean;
      tags?: string[];
    }) => post<Note>("/notes", payload),
    update: (id: string, payload: Partial<Note>) => patch<Note>(`/notes/${id}`, payload),
    remove: (id: string) => del(`/notes/${id}`),
  },
  highlights: {
    list: (params: Record<string, QueryValue> = {}) =>
      get<{ items: Highlight[]; total: number }>(`/highlights${qs(params)}`),
    create: (payload: {
      text: string;
      user_book_id?: string | null;
      page_ref?: string | null;
      commentary?: string | null;
      tags?: string[];
    }) => post<Highlight>("/highlights", payload),
    update: (id: string, payload: Partial<Highlight>) => patch<Highlight>(`/highlights/${id}`, payload),
    remove: (id: string) => del(`/highlights/${id}`),
  },
  journal: {
    list: (params: Record<string, QueryValue> = {}) =>
      get<Paginated<JournalEntry>>(`/journal${qs(params)}`),
    create: (payload: Partial<JournalEntry> & { entry_date: string }) =>
      post<JournalEntry>("/journal", payload),
    update: (id: string, payload: Partial<JournalEntry>) =>
      patch<JournalEntry>(`/journal/${id}`, payload),
    remove: (id: string) => del(`/journal/${id}`),
  },
  knowledge: {
    overview: () => get<KnowledgeOverview>("/knowledge/overview"),
    search: (q: string) => get<KnowledgeSearch>(`/knowledge/search${qs({ q })}`),
  },
  notifications: {
    list: (params: Record<string, QueryValue> = {}) =>
      get<Paginated<Notification> & { unread: number }>(`/notifications${qs(params)}`),
    markRead: (id: string) => post<{ message: string }>(`/notifications/${id}/read`),
    markAllRead: () => post<{ message: string }>("/notifications/read-all"),
    remove: (id: string) => del(`/notifications/${id}`),
    testEmail: () => post<{ job_id: string; status: string }>("/notifications/test-email"),
    reportPreview: (period: "week" | "month") =>
      get<ReportPreview>(`/notifications/reports/preview${qs({ period })}`),
    sendReport: (period: "week" | "month") =>
      post<{ job_id: string; status: string }>("/notifications/reports/send", { period }),
  },
  ai: {
    status: () => get<AIStatus>("/ai/status"),
    test: () => post<{ ok: boolean; message: string; model?: string }>("/ai/test"),
    summaries: (userBookId?: string) =>
      get<{ items: AISummary[] }>(`/ai/summaries${qs({ user_book_id: userBookId })}`),
    createSummary: (payload: { user_book_id: string; kind: string; length: string; document_ids?: string[] }) =>
      post<{ job_id: string; status: string }>("/ai/summaries", payload),
    deleteSummary: (id: string) => del(`/ai/summaries/${id}`),
    conversations: () => get<{ items: Conversation[] }>("/ai/conversations"),
    createConversation: (user_book_id?: string | null) =>
      post<{ id: string; title: string }>("/ai/conversations", { user_book_id }),
    conversation: (id: string) => get<ConversationDetail>(`/ai/conversations/${id}`),
    sendMessage: (id: string, content: string) =>
      post<{ message: import("./types").ConversationMessage; conversation_id: string }>(
        `/ai/conversations/${id}/messages`,
        { content },
      ),
    deleteConversation: (id: string) => del(`/ai/conversations/${id}`),
    insights: (status = "pending") => get<{ items: AIInsight[] }>(`/ai/insights${qs({ status })}`),
    extractInsights: (user_book_id?: string | null) =>
      post<{ job_id: string; status: string }>("/ai/insights", { user_book_id }),
    acceptInsight: (id: string) => post<{ note_id: string }>(`/ai/insights/${id}/accept`),
    dismissInsight: (id: string) => post<{ message: string }>(`/ai/insights/${id}/dismiss`),
    recommendations: (count = 5) =>
      post<{ items: AIRecommendation[] }>("/ai/recommendations", { count, include_rereads: false }),
    documents: () => get<{ items: AIDocument[] }>("/ai/documents"),
    uploadDocument: (file: File, userBookId?: string | null) => {
      const form = new FormData();
      form.append("file", file);
      return request<{ document: AIDocument }>(`/ai/documents${qs({ user_book_id: userBookId })}`, {
        method: "POST",
        body: form,
      });
    },
    deleteDocument: (id: string) => del(`/ai/documents/${id}`),
  },
  imports: {
    list: () => get<{ items: ImportJob[] }>("/imports"),
    upload: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<ImportPreview>("/imports", { method: "POST", body: form });
    },
    get: (id: string) => get<ImportJob>(`/imports/${id}`),
    commit: (id: string) => post<{ job_id: string; import_id: string }>(`/imports/${id}/commit`),
    remove: (id: string) => del(`/imports/${id}`),
    templateUrl: `${API}/imports/template`,
  },
  exports: {
    list: () => get<{ items: ExportJob[] }>("/exports"),
    create: (format: string) => post<{ id: string; job_id: string; status: string }>("/exports", { format }),
    get: (id: string) => get<ExportJob>(`/exports/${id}`),
    remove: (id: string) => del(`/exports/${id}`),
  },
  jobs: {
    get: (id: string) => get<BackgroundJob>(`/jobs/${id}`),
  },
};

export async function downloadExport(id: string, filename: string) {
  const response = await fetch(`${API}/exports/${id}/download`, { credentials: "include" });
  if (!response.ok) {
    let message = "Download failed.";
    try {
      const body = await response.json();
      message = body?.error?.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, "download_failed", message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function apiBase() {
  return API;
}
