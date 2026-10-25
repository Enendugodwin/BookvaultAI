import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const verify = useMutation({
    mutationFn: (value: string) => api.auth.verifyEmail(value),
    onError: (err) => setError(err instanceof ApiError ? err.message : "This verification link could not be used."),
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError("This link is missing its verification token. Request a new email from Settings.");
      return;
    }
    verify.mutate(token);
    // The mutation object is stable enough for a one-shot effect; the ref keeps
    // React StrictMode from spending the token twice in development.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthLayout
      title="Verifying your email."
      subtitle="One moment while we confirm this address belongs to you."
      footer={
        <>
          You can close this tab and{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            return to sign in
          </Link>
          .
        </>
      }
    >
      <div className="flex flex-col items-center py-6 text-center">
        {verify.isPending ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Checking the token…</p>
          </>
        ) : error ? (
          <>
            <XCircle className="h-8 w-8 text-destructive" />
            <p role="alert" className="mt-3 text-sm font-medium text-destructive">
              Verification failed
            </p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-6 text-muted-foreground">{error}</p>
            <Button className="mt-4" onClick={() => window.location.assign("/login")}>
              Go to sign in
            </Button>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="mt-3 text-sm font-medium">Your email is verified</p>
            <p className="mt-1 text-[12.5px] leading-6 text-muted-foreground">
              {verify.data?.message ?? "You are all set."}
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open BookVault
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
