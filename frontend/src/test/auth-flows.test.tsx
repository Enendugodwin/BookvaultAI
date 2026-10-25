import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const verifyEmail = vi.fn();
const reset = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { auth: { verifyEmail: (token: string) => verifyEmail(token), reset: (token: string, password: string) => reset(token, password) } },
  ApiError: class ApiError extends Error {},
}));

import { VerifyEmailPage } from "@/pages/verify-email";
import { ResetPasswordPage } from "@/pages/reset-password";

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{path.startsWith("/verify") ? <VerifyEmailPage /> : <ResetPasswordPage />}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("email link pages", () => {
  it("verifies an email token and confirms success", async () => {
    verifyEmail.mockResolvedValue({ message: "Email verified." });
    renderAt("/verify-email?token=abcdefghijklmnop");
    expect(await screen.findByText("Your email is verified")).toBeInTheDocument();
    expect(verifyEmail).toHaveBeenCalledWith("abcdefghijklmnop");
  });

  it("explains a missing reset token instead of rendering a broken form", () => {
    renderAt("/reset-password");
    expect(screen.getByText("This link is incomplete")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
