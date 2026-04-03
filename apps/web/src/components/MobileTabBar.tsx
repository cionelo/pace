interface MobileTabBarProps {
  windowIds: string[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function MobileTabBar({ windowIds, activeId, onSelect }: MobileTabBarProps) {
  if (windowIds.length < 2) return null;

  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-3 backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-800">
      {windowIds.map((id, index) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            id === activeId
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          W{index + 1}
        </button>
      ))}
    </div>
  );
}
