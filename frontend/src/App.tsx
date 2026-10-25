import { Route, Routes } from "react-router-dom";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/layout/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { LoginPage } from "@/pages/login";
import { RegisterPage } from "@/pages/register";
import { ResetPasswordPage } from "@/pages/reset-password";
import { VerifyEmailPage } from "@/pages/verify-email";
import { OnboardingPage } from "@/pages/onboarding";
import { DashboardPage } from "@/pages/dashboard";
import { LibraryPage } from "@/pages/library";
import { ReadingPage } from "@/pages/reading";
import { BookDetailPage } from "@/pages/book-detail";
import { GoalsPage } from "@/pages/goals";
import { AnalyticsPage } from "@/pages/analytics";
import { AssistantPage } from "@/pages/assistant";
import { NotesPage } from "@/pages/notes";
import { DiscoverPage } from "@/pages/discover";
import { JournalPage } from "@/pages/journal";
import { NotificationsPage } from "@/pages/notifications";
import { SettingsPage } from "@/pages/settings";
import { NotFoundPage } from "@/pages/not-found";

export default function App() {
  return (
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
