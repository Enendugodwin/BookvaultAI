import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, KeyRound, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => api.auth.reset(token, password),
    onSuccess: () => {
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "This reset link could not be used."),
  });

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = Boolean(token) && password.length >= 10 && password === confirm;

  if (reset.isSuccess) {
    return (
      <AuthLayout
        title="Password updated."
        subtitle="Your account is secure with the new password."
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in with your new password
          </Link>
        }
      >
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <p className="mt-3 text-sm font-medium">The reset link has been used</p>
          <p className="mt-1 max-w-sm text-[12.5px] leading-6 text-muted-foreground">
            Other sessions were revoked. Use your new password to sign in again.
          </p>
          <Button className="mt-4" onClick={() => navigate("/login", { replace: true })}>
            Continue to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password."
      subtitle="Reset links expire after 60 minutes and can only be used once."
      footer={
        <>
          Need a new link?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Request another reset
          </Link>
        </>
      }
    >
      {!token ? (
        <div className="flex flex-col items-center py-6 text-center">
          <XCircle className="h-8 w-8 text-destructive" />
          <p className="mt-3 text-sm font-medium">This link is incomplete</p>
          <p className="mt-1 max-w-sm text-[12.5px] leading-6 text-muted-foreground">
            The reset token is missing. Request a new reset email from the sign-in page.
          </p>
          <Button className="mt-4" onClick={() => navigate("/login")}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) reset.mutate();
          }}
        >
          {error && (
            <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive">
              {error}
            </div>
          )}
          <div>
            <Label htmlFor="new-password" hint="min. 10 characters">
              New password
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                autoFocus
                required
                minLength={10}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
              minLength={10}
              aria-invalid={mismatch}
              aria-describedby={mismatch ? "confirm-error" : undefined}
            />
            {mismatch && (
              <p id="confirm-error" className="mt-1 text-[11.5px] text-destructive">
                Passwords do not match.
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" loading={reset.isPending} disabled={!canSubmit}>
            <KeyRound className="h-4 w-4" /> Set new password
          </Button>
          <p className="text-center text-[11px] leading-5 text-muted-foreground">
            Resetting your password signs out every other device.
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
