import { useState } from "react";
import { useWindowStore } from "../stores/window-store";
import { MAX_WINDOWS } from "../lib/constants";
import ContactModal from "./ContactModal";

export default function Header() {
  const windowCount = useWindowStore((s) => s.windows.length);
  const addWindow = useWindowStore((s) => s.addWindow);
  const atCapacity = windowCount >= MAX_WINDOWS;
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
      {/* Left: logo + title + attribution */}
      <div className="flex items-center gap-2">
        <img src="/favicon.png" alt="PACE logo" className="w-10 h-10" />
        <h1 className="text-xl font-bold tracking-tight text-white">PACE</h1>
        <span className="text-xs font-thin italic text-zinc-500">
          built by{" "}
          <a
            href="https://itsnemo.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            itsnemo.dev
          </a>
        </span>
      </div>

      {/* Right: community icons + new window */}
      <div className="flex items-center gap-3">
        {/* Ko-fi support — replace PLACEHOLDER once account is created */}
        <a
          href="https://ko-fi.com/devbynemo"
          target="_blank"
          rel="noopener noreferrer"
          title="Support PACE on Ko-fi"
          className="text-zinc-400 hover:text-red-400 transition-colors text-lg leading-none"
        >
          ♥
        </a>

        {/* Contact / submissions */}
        <button
          onClick={() => setContactOpen(true)}
          title="Report a bug or request a race"
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
        >
          ✉
        </button>

        <button
          onClick={() => addWindow()}
          disabled={atCapacity}
          className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          + New Window {windowCount > 0 && `(${windowCount}/${MAX_WINDOWS})`}
        </button>
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}
