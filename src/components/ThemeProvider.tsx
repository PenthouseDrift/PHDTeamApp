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
  const { data: session } = useSession();
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Priority: session theme > localStorage > system preference
    const userTheme = session?.user?.theme as Theme | undefined;
    const saved = localStorage.getItem("phd-theme") as Theme | null;
    const initialTheme = userTheme || saved;

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
    localStorage.setItem("phd-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");

    // Sync to user profile in Redis if logged in
    if (session?.user?.id) {
      updateUserTheme(session.user.id, next);
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
