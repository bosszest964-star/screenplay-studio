"use client";

import { useEffect } from "react";
import { themeStorageKey, useAppearance } from "@/lib/appearance";

export function useTheme() {
  const theme = useAppearance((state) => state.theme);
  const setTheme = useAppearance((state) => state.setTheme);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const active = theme ?? (preference.matches ? "dark" : "light");
      document.documentElement.dataset.theme = active;
      document.querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", active === "dark" ? "#151320" : "#f8f8fc");
    };
    applyTheme();
    preference.addEventListener("change", applyTheme);
    return () => preference.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === themeStorageKey) void useAppearance.persist.rehydrate();
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  return () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}
