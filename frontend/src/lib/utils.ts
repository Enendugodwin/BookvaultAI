import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { BookStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

export function formatMinutes(totalMinutes: number | null | undefined) {
  if (!totalMinutes) return "0m";
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatDate(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, opts ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86400_000],
    ["month", 30 * 86400_000],
    ["week", 7 * 86400_000],
    ["day", 86400_000],
    ["hour", 3600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export const STATUS_META: Record<BookStatus, { label: string; tone: string }> = {
  want_to_read: { label: "Want to read", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  reading: { label: "Reading", tone: "bg-primary/10 text-primary" },
  completed: { label: "Completed", tone: "bg-success/10 text-success" },
  paused: { label: "Paused", tone: "bg-warning/10 text-warning" },
  abandoned: { label: "Abandoned", tone: "bg-muted text-muted-foreground" },
  rereading: { label: "Rereading", tone: "bg-accent/10 text-accent" },
};

export function statusLabel(status: string) {
  return STATUS_META[status as BookStatus]?.label ?? status.replaceAll("_", " ");
}

export function statusTone(status: string) {
  return STATUS_META[status as BookStatus]?.tone ?? "bg-muted text-muted-foreground";
}

export const GOAL_LABELS: Record<string, string> = {
  books: "Books finished",
  genre_books: "Books in a genre",
  pages: "Pages read",
  minutes: "Minutes read",
  hours: "Hours read",
  sessions: "Reading sessions",
  streak: "Day streak",
};

export const GOAL_UNITS: Record<string, string> = {
  books: "books",
  genre_books: "books",
  pages: "pages",
  minutes: "minutes",
  hours: "hours",
  sessions: "sessions",
  streak: "days",
};

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const COVER_GRADIENTS = [
  ["#8c5a3c", "#d8b190"],
  ["#3f5d52", "#a9c3ad"],
  ["#563f5b", "#b9a0bd"],
  ["#2f4858", "#8fb3c4"],
  ["#7a4a2f", "#d6a77a"],
  ["#4c4a2f", "#b8b78a"],
];

export function coverGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const [from, to] = COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
  return `linear-gradient(140deg, ${from} 0%, ${to} 100%)`;
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function yearStartISO(year = new Date().getFullYear()) {
  return `${year}-01-01`;
}

export function yearEndISO(year = new Date().getFullYear()) {
  return `${year}-12-31`;
}

export function percent(value: number | null | undefined) {
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

export function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 30);
}

export function absoluteUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function readingTimeLabel(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}
