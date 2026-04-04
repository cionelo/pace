import { useEffect } from "react";
import Header from "./components/Header";
import WindowGrid from "./components/WindowGrid";
import { useThemeStore } from "./stores/theme-store";

export default function App() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="min-h-screen bg-pace-bg text-pace-text transition-colors duration-300">
      <Header />
      <WindowGrid />
    </div>
  );
}
