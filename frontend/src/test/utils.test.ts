import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  cn,
  formatMinutes,
  formatNumber,
  initials,
  parseTags,
  percent,
  statusLabel,
} from "@/lib/utils";
import { qs } from "@/lib/api";

describe("formatting helpers", () => {
  it("formats minutes into readable durations", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(135)).toBe("2h 15m");
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(null)).toBe("0m");
  });

  it("formats numbers with grouping and handles missing values", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(12.6, 1)).toBe("12.6");
  });

  it("clamps percentages", () => {
    expect(percent(42.4)).toBe(42);
    expect(percent(-3)).toBe(0);
    expect(percent(130)).toBe(100);
    expect(percent(null)).toBe(0);
  });

  it("derives initials from names", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  ")).toBe("");
  });

  it("parses comma separated tags without duplicates", () => {
    expect(parseTags(" systems, attention ,systems, , memory ")).toEqual([
      "systems",
      "attention",
      "memory",
    ]);
    expect(parseTags("")).toEqual([]);
  });

  it("maps statuses to labels and joins class names", () => {
    expect(statusLabel("want_to_read")).toBe("Want to read");
    expect(statusLabel("unknown_status")).toBe("unknown status");
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("adds days across month boundaries in ISO form", () => {
    expect(addDaysISO("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDaysISO("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("query string builder", () => {
  it("skips empty values and encodes the rest", () => {
    expect(qs({ q: "dune messiah", page: 2, empty: "", missing: undefined, flag: false })).toBe(
      "?q=dune+messiah&page=2&flag=false",
    );
    expect(qs({})).toBe("");
  });
});
