import { useState } from "react";
import { useWindowStore } from "../stores/window-store";
import PaceWindow from "./PaceWindow";
import MobileTabBar from "./MobileTabBar";

function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count <= 2) return "sm:grid-cols-2";
  if (count <= 4) return "sm:grid-cols-2";
  return "sm:grid-cols-2 lg:grid-cols-3";
}

export default function WindowGrid() {
  const windows = useWindowStore((s) => s.windows);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (windows.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-pace-text-muted font-light">
        Click &quot;+ New Window&quot; to start comparing athletes
      </div>
    );
  }

  const activeId =
    activeTab && windows.some((w) => w.id === activeTab)
      ? activeTab
      : windows[0].id;

  return (
    <>
      {/* Desktop grid */}
      <div className={`hidden sm:grid ${gridClass(windows.length)} gap-5 p-5`}>
        {windows.map((w) => (
          <PaceWindow key={w.id} windowId={w.id} />
        ))}
      </div>

      {/* Mobile: single window + tab bar */}
      <div className="sm:hidden p-4 pb-20">
        <PaceWindow windowId={activeId} />
      </div>
      {windows.length > 1 && (
        <MobileTabBar
          windowIds={windows.map((w) => w.id)}
          activeId={activeId}
          onSelect={setActiveTab}
        />
      )}
    </>
  );
}
