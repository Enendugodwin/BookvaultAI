import { lazy, Suspense, type ComponentType } from "react";
import { Route, Routes } from "react-router-dom";
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/app-shell";

// Route-level code splitting keeps the initial bundle small. The shell and the
// auth guards stay eager so navigation renders immediately; pages are fetched
// on first visit and then cached by the browser.
function page<T extends { [key: string]: unknown }>(loader: () => Promise<T>, name: keyof T) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[name] as unknown as ComponentType };
  });
}

const LoginPage = page(() => import("@/pages/login"), "LoginPage");
const RegisterPage = page(() => import("@/pages/register"), "RegisterPage");
const ResetPasswordPage = page(() => import("@/pages/reset-password"), "ResetPasswordPage");
const VerifyEmailPage = page(() => import("@/pages/verify-email"), "VerifyEmailPage");
const OnboardingPage = page(() => import("@/pages/onboarding"), "OnboardingPage");
const DashboardPage = page(() => import("@/pages/dashboard"), "DashboardPage");
const LibraryPage = page(() => import("@/pages/library"), "LibraryPage");
const ReadingPage = page(() => import("@/pages/reading"), "ReadingPage");
const BookDetailPage = page(() => import("@/pages/book-detail"), "BookDetailPage");
const GoalsPage = page(() => import("@/pages/goals"), "GoalsPage");
const AnalyticsPage = page(() => import("@/pages/analytics"), "AnalyticsPage");
const AssistantPage = page(() => import("@/pages/assistant"), "AssistantPage");
const NotesPage = page(() => import("@/pages/notes"), "NotesPage");
const DiscoverPage = page(() => import("@/pages/discover"), "DiscoverPage");
const JournalPage = page(() => import("@/pages/journal"), "JournalPage");
const NotificationsPage = page(() => import("@/pages/notifications"), "NotificationsPage");
const SettingsPage = page(() => import("@/pages/settings"), "SettingsPage");
const AdminPage = page(() => import("@/pages/admin"), "AdminPage");
const NotFoundPage = page(() => import("@/pages/not-found"), "NotFoundPage");

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="sr-only">Loading page</span>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Token links must work even if the browser already has a session. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="reading" element={<ReadingPage />} />
            <Route path="books/:id" element={<BookDetailPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route element={<AdminRoute />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
