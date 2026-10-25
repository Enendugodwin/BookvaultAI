import type { Theme } from "./types";

export interface ThemeOption {
  value: Theme;
  label: string;
  description: string;
  dark: boolean;
  swatch: [string, string, string];
}

export const THEMES: ThemeOption[] = [
  { value: "system", label: "System", description: "Match this device", dark: false, swatch: ["#faf7f2", "#6b5b4d", "#b4562f"] },
  { value: "light", label: "Parchment", description: "Warm paper and ink", dark: false, swatch: ["#faf7f2", "#ffffff", "#b4562f"] },
  { value: "dark", label: "Night", description: "Late-night reading", dark: true, swatch: ["#171412", "#241f1b", "#e08a55"] },
  { value: "pink", label: "Pink", description: "Rose quartz and plum", dark: false, swatch: ["#fdf2f6", "#ffffff", "#c12f70"] },
  { value: "midnight", label: "Midnight", description: "Navy sky and electric blue", dark: true, swatch: ["#0a1224", "#141f36", "#4d9fff"] },
  { value: "purple", label: "Purple", description: "Royal violet twilight", dark: true, swatch: ["#160f24", "#241735", "#b18cff"] },
  { value: "forest", label: "Forest", description: "Moss, pine and paper", dark: false, swatch: ["#f2f7f1", "#ffffff", "#2e6b46"] },
  { value: "sepia", label: "Sepia", description: "Aged bookshop light", dark: false, swatch: ["#f4ead9", "#fffaf0", "#8a4b23"] },
];

export const THEME_VALUES = new Set<string>(THEMES.map((theme) => theme.value));

export function isTheme(value: string | null | undefined): value is Theme {
  return Boolean(value && THEME_VALUES.has(value));
}

export function themeIsDark(theme: Theme): boolean {
  return THEMES.find((entry) => entry.value === theme)?.dark ?? false;
}

/** Browser chrome colour for a theme (used by the mobile theme-color meta tag). */
export function themeBackground(theme: Theme, dark: boolean): string {
  if (theme === "system") return dark ? "#171412" : "#faf7f2";
  return THEMES.find((entry) => entry.value === theme)?.swatch[0] ?? (dark ? "#171412" : "#faf7f2");
}
