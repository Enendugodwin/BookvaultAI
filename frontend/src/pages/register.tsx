import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { api, ApiError, setCsrfToken } from "@/lib/api";
import { useAuth } from "@/context/auth";
import { AuthLayout } from "@/components/layout/auth-layout";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function RegisterPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(
    () => [
      { label: "At least 10 characters", ok: password.length >= 10 },
      { label: "Contains a letter", ok: /[a-zA-Z]/.test(password) },
      { label: "Contains a number", ok: /\d/.test(password) },
    ],
    [password],
  );

  const register = useMutation({
    mutationFn: () =>
      api.auth.register({ display_name: displayName.trim(), email: email.trim(), password }),
    onSuccess: ({ user }) => {
      setUser(user);
      setCsrfToken(user.csrf_token);
      navigate("/onboarding", { replace: true });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not create your account.");
    },
  });

  const passwordsMatch = confirm.length === 0 || password === confirm;
  const canSubmit =
    displayName.trim().length > 0 &&
    email.trim().length > 3 &&
    rules.every((rule) => rule.ok) &&
    password === confirm;

  return (
    <AuthLayout
      title="Create your vault."
      subtitle="A private library, a reading practice, and a place for what you learn."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          register.mutate();
        }}
      >
        {error && (
          <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex Reader" autoComplete="name" required autoFocus />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              autoComplete="new-password"
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
          <ul className="mt-2 grid gap-1">
            {rules.map((rule) => (
              <li key={rule.label} className={cn("flex items-center gap-1.5 text-[11.5px]", rule.ok ? "text-success" : "text-muted-foreground")}>
                <Check className={cn("h-3 w-3", rule.ok ? "opacity-100" : "opacity-30")} />
                {rule.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            aria-invalid={!passwordsMatch}
          />
          {!passwordsMatch && <p className="mt-1 text-[11.5px] text-destructive">Passwords do not match.</p>}
        </div>
        <Button type="submit" className="w-full" size="lg" loading={register.isPending} disabled={!canSubmit}>
          Create account <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-center text-[11.5px] leading-5 text-muted-foreground">
          By creating an account you agree to keep your account credentials private.
          Your reading data is never sold or shared.
        </p>
      </form>
    </AuthLayout>
  );
}
