import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { BookCover } from "@/components/books/book-cover";
import { BookMarked } from "lucide-react";

describe("UI primitives", () => {
  it("renders a badge with content", () => {
    render(<Badge>Reading</Badge>);
    expect(screen.getByText("Reading")).toBeInTheDocument();
  });

  it("exposes progress semantics", () => {
    render(<Progress value={42} label="Reading progress" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-label", "Reading progress");
  });

  it("clamps progress values to the valid range", () => {
    render(<Progress value={250} label="Too much" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    render(<Progress value={-10} label="Too little" />);
    expect(screen.getByRole("progressbar", { name: "Too little" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("renders an empty state with an action", () => {
    render(
      <EmptyState
        icon={BookMarked}
        title="Nothing here"
        description="Add something to get started."
        action={<button type="button">Add book</button>}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add book" })).toBeInTheDocument();
  });

  it("falls back to a typographic cover when no image is available", () => {
    render(<BookCover title="The Left Hand of Darkness" authors={["Ursula K. Le Guin"]} url={null} />);
    expect(screen.getByText("The Left Hand of Darkness")).toBeInTheDocument();
    expect(screen.getByText("Ursula K. Le Guin")).toBeInTheDocument();
  });
});
