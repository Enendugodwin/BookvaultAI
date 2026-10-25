import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/context/auth";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-xl bg-foreground text-background">
          <BookOpen className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted-foreground">Opening your vault…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user.settings.onboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    return <Navigate to={user.settings.onboarded ? "/" : "/onboarding"} replace />;
  }
  return <Outlet />;
}
