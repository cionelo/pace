import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "light";
  try {
    const saved = localStorage.getItem("pace-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // localStorage unavailable
  }
  return "light";
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: getInitialTheme(),
  toggle: () => {
    const next = get().theme === "light" ? "dark" : "light";
    localStorage.setItem("pace-theme", next);
    set({ theme: next });
  },
}));
