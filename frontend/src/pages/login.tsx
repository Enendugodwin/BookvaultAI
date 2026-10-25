import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { api, ApiError, setCsrfToken } from "@/lib/api";
import { useAuth } from "@/context/auth";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetStage, setResetStage] = useState<"request" | "reset">("request");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () => api.auth.login({ email: email.trim(), password }),
    onSuccess: ({ user }) => {
      setUser(user);
      setCsrfToken(user.csrf_token);
      const from = (location.state as { from?: string } | null)?.from;
      toast.success(`Welcome back, ${user.display_name.split(" ")[0]}`);
      navigate(user.settings.onboarded ? (from && from !== "/login" ? from : "/") : "/onboarding", { replace: true });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Please retry.");
    },
  });

  const forgot = useMutation({
    mutationFn: () => api.auth.forgot(forgotEmail.trim()),
    onSuccess: (result) => {
      setResetToken(result.reset_token ?? "");
      setResetStage("reset");
      setResetMessage(result.reset_token ? null : result.message);
      if (result.reset_token) {
        toast.toast("Reset token ready", { description: "This development server returns the token directly." });
      }
    },
    onError: (err) => setResetMessage(err instanceof ApiError ? err.message : "Could not start a reset."),
  });

  const reset = useMutation({
    mutationFn: () => api.auth.reset(resetToken.trim(), newPassword),
    onSuccess: (result) => {
      toast.success("Password updated", result.message);
      setForgotOpen(false);
      setResetStage("request");
      setResetToken("");
      setNewPassword("");
      setPassword("");
    },
    onError: (err) => setResetMessage(err instanceof ApiError ? err.message : "Could not reset the password."),
  });

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Sign in to pick up where your reading left off."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create your vault
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          login.mutate();
        }}
      >
        {error && (
          <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password" className="mb-0">Password</Label>
            <button
              type="button"
              onClick={() => {
                setForgotOpen(true);
                setForgotEmail(email);
                setResetStage("request");
                setResetMessage(null);
              }}
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-center text-[11.5px] leading-5 text-muted-foreground">
          Sessions are stored in a secure, HttpOnly cookie. You can review active devices in Settings.
        </p>
      </form>

      <Dialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title={resetStage === "request" ? "Reset your password" : "Choose a new password"}
        description={
          resetStage === "request"
            ? "We will send a reset link if that email is registered."
            : "Paste the token from your reset email, then pick a strong new password."
        }
        size="sm"
        footer={
          resetStage === "request" ? (
            <Button onClick={() => forgot.mutate()} loading={forgot.isPending} disabled={!forgotEmail.trim()}>
              Send reset link
            </Button>
          ) : (
            <Button onClick={() => reset.mutate()} loading={reset.isPending} disabled={!resetToken || newPassword.length < 10}>
              Update password
            </Button>
          )
        }
      >
        <div className="space-y-4">
          {resetMessage && (
            <p className="rounded-md bg-muted/70 px-3 py-2 text-[12.5px] leading-5 text-muted-foreground">{resetMessage}</p>
          )}
          {resetStage === "request" ? (
            <div>
              <Label htmlFor="forgot-email">Account email</Label>
              <Input id="forgot-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@example.com" />
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="reset-token">Reset token</Label>
                <Input id="reset-token" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Paste token" />
              </div>
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 10 characters, one digit" />
              </div>
            </>
          )}
        </div>
      </Dialog>
    </AuthLayout>
  );
}
