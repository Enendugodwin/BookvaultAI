export type Theme = "light" | "dark" | "system";
export type BookStatus =
  | "want_to_read"
  | "reading"
  | "completed"
  | "paused"
  | "abandoned"
  | "rereading";

export interface UserSettings {
  timezone: string;
  theme: Theme;
  preferred_genres: string[];
  onboarded: boolean;
  reminder_time: string;
  reminder_days: number[];
  notify_inapp: boolean;
  notify_email: boolean;
  weekly_summary: boolean;
  monthly_report: boolean;
  ai_enabled: boolean;
  ai_external_consent: boolean;
  page_size: number;
  library_view: "grid" | "table" | "compact";
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
  created_at: string;
  csrf_token: string | null;
  settings: UserSettings;
}

export interface AuthResponse {
  user: User;
}

export interface BookMeta {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn10: string | null;
  isbn13: string | null;
  description: string | null;
  publisher: string | null;
  published_date: string | null;
  language: string | null;
  page_count: number | null;
  cover_url: string | null;
  categories: string[];
  google_books_id: string | null;
  openlibrary_id: string | null;
}

export interface UserBook {
  id: string;
  book: BookMeta;
  status: BookStatus;
  rating: number | null;
  review: string | null;
  current_page: number | null;
  progress_percent: number | null;
  started_at: string | null;
  completed_at: string | null;
  archived: boolean;
  genre: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  stats?: {
    sessions: number;
    minutes: number;
    notes: number;
    highlights: number;
  };
}

export interface BookInput {
  title: string;
  subtitle?: string | null;
  authors?: string[];
  isbn10?: string | null;
  isbn13?: string | null;
  description?: string | null;
  publisher?: string | null;
  published_date?: string | null;
  language?: string | null;
  page_count?: number | null;
  cover_url?: string | null;
  categories?: string[];
  genre?: string | null;
  google_books_id?: string | null;
  openlibrary_id?: string | null;
  status?: BookStatus;
  rating?: number | null;
  review?: string | null;
  current_page?: number | null;
  tags?: string[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages?: number;
}

export interface LibraryResponse extends Paginated<UserBook> {
  pages: number;
}

export interface Facets {
  genres: { name: string; count: number }[];
  tags: { name: string; count: number }[];
  statuses: Record<string, number>;
}

export interface ReadingSession {
  id: string;
  user_book_id: string;
  book_title: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  duration_minutes: number;
  paused_seconds: number;
  start_page: number | null;
  end_page: number | null;
  pages_read: number | null;
  pages_per_hour: number | null;
  notes: string | null;
  source: string;
  created_at: string;
}

export interface ActiveTimer {
  id: string;
  user_book_id: string;
  book_title: string | null;
  started_at: string;
  accumulated_seconds: number;
  running: boolean;
  paused_at: string | null;
  elapsed_seconds: number;
  start_page: number | null;
  notes: string | null;
}

export interface Goal {
  id: string;
  name: string;
  goal_type: "books" | "pages" | "minutes" | "hours" | "sessions" | "streak" | "genre_books";
  period: "day" | "week" | "month" | "year" | "custom";
  genre?: string | null;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  target_value: number;
  current_value?: number;
  percent?: number;
  remaining?: number;
  days_remaining?: number;
  required_pace?: number;
  completed?: boolean;
  completed_at?: string | null;
  milestones?: { percent: number; label: string; reached: boolean }[];
  created_at?: string;
  updated_at?: string;
  rationale?: string;
  evidence?: Record<string, number>;
}

export interface GoalInput {
  name: string;
  goal_type: Goal["goal_type"];
  period: Goal["period"];
  target_value: number;
  start_date: string;
  end_date: string;
  genre?: string | null;
}

export interface AnalyticsSummary {
  total_books: number;
  completed_this_year: number;
  currently_reading: number;
  wishlist: number;
  total_pages_read: number;
  total_minutes_read: number;
  total_sessions: number;
  current_streak: number;
  year: number;
  annual_goal: {
    id: string | null;
    name: string;
    goal_type: string;
    target_value: number;
    current_value: number;
    percent: number;
    remaining: number;
  };
}

export interface Totals {
  books_completed: number;
  pages: number;
  minutes: number;
  sessions: number;
}

export interface AnalyticsOverview {
  range: { start: string; end: string; days: number };
  totals: Totals;
  previous_totals: Totals;
  daily: { date: string; pages: number; minutes: number; sessions: number }[];
  monthly: { month: string; pages: number; minutes: number; sessions: number; books: number }[];
  genres: { genre: string; count: number }[];
  status_counts: Record<string, number>;
  ratings_by_genre: { genre: string; average: number; count: number }[];
}

export interface Heatmap {
  year: number;
  metric: "pages" | "minutes" | "sessions";
  days: { date: string; value: number; pages: number; minutes: number; sessions: number }[];
  max_value: number;
  total: number;
}

export interface CurrentlyReadingItem {
  id: string;
  book: { id: string; title: string; authors: string[]; cover_url: string | null; page_count: number | null };
  current_page: number | null;
  progress_percent: number | null;
  last_read_at: string | null;
  estimated_completion_date: string | null;
  avg_pages_per_day_30d: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  user_book_id: string | null;
  book_title: string | null;
  page_ref: string | null;
  is_important: boolean;
  source: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Highlight {
  id: string;
  text: string;
  commentary: string | null;
  page_ref: string | null;
  user_book_id: string | null;
  book_title: string | null;
  tags: string[];
  created_at: string;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  title: string | null;
  reflections: string | null;
  ideas: string | null;
  questions: string | null;
  lessons: string | null;
  applications: string | null;
  mood: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeOverview {
  recent_notes: Note[];
  recent_highlights: Highlight[];
  important_notes: Note[];
  pending_insights: { id: string; kind: string; content: string; book_title: string | null; created_at: string }[];
  top_tags: { name: string; count: number }[];
  counts: { notes: number; highlights: number; journal_entries: number; important: number };
}

export interface KnowledgeSearch {
  notes: Note[];
  highlights: Highlight[];
  journal: JournalEntry[];
}

export interface Notification {
  id: string;
  category: string;
  title: string;
  body: string;
  read: boolean;
  read_at: string | null;
  email_status: string | null;
  created_at: string;
}

export interface CatalogueItem {
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn10: string | null;
  isbn13: string | null;
  description: string | null;
  publisher: string | null;
  published_date: string | null;
  language: string | null;
  page_count: number | null;
  cover_url: string | null;
  categories: string[];
  google_books_id: string | null;
  openlibrary_id: string | null;
  source: string;
}

export interface CatalogueSearch {
  query: string;
  field: string;
  items: CatalogueItem[];
  errors: string[];
  degraded: boolean;
  attribution: string;
  cached: boolean;
}

export interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
  configured: boolean;
  external_processing: boolean;
  daily_limit: number;
  used_today: number;
  remaining_today: number;
  message: string;
}

export interface AISummary {
  id: string;
  user_book_id: string;
  kind: string;
  length: string;
  content: string;
  coverage: string;
  coverage_note: string | null;
  sources: { type: string; id?: string; label?: string }[];
  provider: string;
  model: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  user_book_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: { type: string; label?: string }[] | null;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

export interface AIInsight {
  id: string;
  kind: string;
  content: string;
  status: "pending" | "accepted" | "dismissed";
  user_book_id: string | null;
  source_note_ids: string[];
  created_at: string;
}

export interface AIDocument {
  id: string;
  filename: string;
  status: string;
  size_bytes: number;
  user_book_id: string | null;
  created_at: string;
  chars: number;
  error: string | null;
}

export interface AIRecommendation {
  title: string;
  authors: string[];
  reason: string;
  genres: string[];
  metadata_verified: boolean;
  ai_suggested: boolean;
}

export interface ImportPreviewRow {
  row: number;
  title: string;
  authors?: string[];
  status: "ready" | "duplicate" | "error";
  message?: string;
}

export interface ImportJob {
  id: string;
  filename: string;
  kind: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  errors: ImportPreviewRow[];
  preview: ImportPreviewRow[];
  created_at: string;
  updated_at: string;
}

export interface ImportPreview {
  id: string;
  filename: string;
  kind: string;
  status: string;
  total_rows: number;
  duplicates: number;
  errors: ImportPreviewRow[];
  preview: ImportPreviewRow[];
}

export interface ExportJob {
  id: string;
  format: string;
  status: string;
  filename: string | null;
  size_bytes: number | null;
  created_at: string;
  expires_at: string | null;
  downloadable: boolean;
}

export interface BackgroundJob {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface SessionInfo {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
  revoked: boolean;
  expired: boolean;
  current: boolean;
}

export interface ReportPreview {
  period: string;
  title: string;
  rows: [string, string][];
  email_configured: boolean;
  email_enabled_by_user: boolean;
}
