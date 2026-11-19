"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

export const themeStorageKey = "sceneform-appearance";

interface Appearance {
  theme: Theme | null;
  setTheme: (theme: Theme) => void;
}

export const useAppearance = create<Appearance>()(
  persist(
    (set) => ({
      theme: null,
      setTheme: (theme) => set({ theme }),
    }),
    { name: themeStorageKey },
  ),
);
