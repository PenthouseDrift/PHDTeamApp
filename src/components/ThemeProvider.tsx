"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { updateUserTheme } from "@/actions/profile";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, update: updateSession } = useSession();
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Priority: this device's last choice (localStorage) > the account's saved theme > system preference.
    // The session copy of the theme is only as fresh as the last sign-in or session update, so it must not
    // override a choice made on this device (that made night mode revert after closing and reopening the app).
    const userTheme = session?.user?.theme as Theme | undefined;
    let saved: Theme | null = null;
    try {
      const raw = localStorage.getItem("phd-theme");
      saved = raw === "dark" || raw === "light" ? raw : null;
    } catch {
      // Storage blocked (private mode): fall back to the account theme.
    }
    const initialTheme = saved || userTheme;

    if (initialTheme) {
      setTheme(initialTheme);
      document.documentElement.classList.toggle("dark", initialTheme === "dark");
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, [session?.user?.theme]);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("phd-theme", next);
    } catch {
      // Storage blocked: the account copy below still keeps it.
    }
    document.documentElement.classList.toggle("dark", next === "dark");

    // Sync to user profile in Redis if logged in, and refresh the session's copy so it doesn't hold the old theme.
    if (session?.user?.id) {
      updateUserTheme(session.user.id, next);
      void updateSession({ theme: next });
    }
  }

  // Prevent flash
  if (!mounted) return <>{children}</>;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
