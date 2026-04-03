import { useWindowStore } from "../stores/window-store";
import PaceWindow from "./PaceWindow";

function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count <= 2) return "grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  return "grid-cols-3";
}

export default function WindowGrid() {
  const windows = useWindowStore((s) => s.windows);

  if (windows.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-zinc-400 dark:text-zinc-500">
        Click &quot;+ New Window&quot; to start comparing athletes
      </div>
    );
  }

  return (
    <div className={`grid ${gridClass(windows.length)} gap-4 p-4`}>
      {windows.map((w) => (
        <PaceWindow key={w.id} windowId={w.id} />
      ))}
    </div>
  );
}
