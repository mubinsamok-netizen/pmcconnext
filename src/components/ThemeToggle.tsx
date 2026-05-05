"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <label className="pmc-theme-toggle" title={isDark ? "Light mode" : "Dark mode"} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      <input type="checkbox" checked={isDark} onChange={toggleTheme} />
      <span className="pmc-theme-toggle-button" aria-hidden="true" />
      <span className="pmc-theme-toggle-label" aria-hidden="true">
        {isDark ? <Moon size={18} strokeWidth={2.4} /> : <Sun size={18} strokeWidth={2.4} />}
      </span>
    </label>
  );
}
