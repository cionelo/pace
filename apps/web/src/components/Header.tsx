import { useState } from "react";
import { useWindowStore } from "../stores/window-store";
import { useThemeStore } from "../stores/theme-store";
import { MAX_WINDOWS } from "../lib/constants";
import ContactModal from "./ContactModal";

export default function Header() {
  const windowCount = useWindowStore((s) => s.windows.length);
  const addWindow = useWindowStore((s) => s.addWindow);
  const atCapacity = windowCount >= MAX_WINDOWS;
  const [contactOpen, setContactOpen] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  return (
    <header className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-pace-border bg-pace-bg">
      {/* Left: logo + attribution */}
      <div className="flex items-center gap-4">
        <img src="/favicon.png" alt="PACE logo" className="w-10 h-10" />
        <h1 className="font-display text-3xl tracking-tight text-pace-text leading-none">PACE</h1>
        <span className="hidden sm:inline text-xs font-light italic text-pace-text-muted">
          built by{" "}
          <a
            href="https://itsnemo.dev/work"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-pace-accent transition-colors duration-300"
          >
            itsnemo.dev
          </a>
        </span>
      </div>

      {/* Right: icons + new window */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-pace-border text-pace-text-muted hover:text-pace-text hover:border-pace-text-secondary transition-all duration-300 hover:scale-105 text-base"
        >
          {theme === "light" ? "\u263D" : "\u2600"}
        </button>

        <a
          href="https://ko-fi.com/devbynemo"
          target="_blank"
          rel="noopener noreferrer"
          title="Support PACE on Ko-fi"
          className="w-9 h-9 flex items-center justify-center rounded-full border border-pace-border text-pace-text-muted hover:text-pace-accent hover:border-pace-accent transition-all duration-300 hover:scale-105 text-base"
        >
          &#9829;
        </a>

        <button
          onClick={() => setContactOpen(true)}
          title="Report a bug or request a race"
          className="w-9 h-9 flex items-center justify-center rounded-full border border-pace-border text-pace-text-muted hover:text-pace-text hover:border-pace-text-secondary transition-all duration-300 hover:scale-105 text-base"
        >
          &#9993;
        </button>

        <button
          onClick={() => addWindow()}
          disabled={atCapacity}
          className="text-sm font-medium px-6 py-2.5 rounded-full bg-pace-accent text-white hover:bg-pace-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:-translate-y-px hover:shadow-lg"
        >
          <span className="sm:hidden">+</span>
          <span className="hidden sm:inline">+ New Window {windowCount > 0 && `(${windowCount}/${MAX_WINDOWS})`}</span>
        </button>
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}
