"use client";

import { Moon, Sun } from "lucide-react";
import { applyThemePref, isDarkNow } from "@/lib/theme";

/** Alterna claro/escuro. O ícone vem do CSS (variante dark:), sem estado no React. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => applyThemePref(isDarkNow() ? "light" : "dark")}
      aria-label="Alternar tema claro e escuro"
      title="Alternar tema"
      className="h-10 w-10 grid place-items-center rounded-[10px] border border-line bg-card text-fg hover:bg-surface transition-colors cursor-pointer"
    >
      <Moon className="w-[18px] h-[18px] dark:hidden" />
      <Sun className="w-[18px] h-[18px] hidden dark:block" />
    </button>
  );
}
