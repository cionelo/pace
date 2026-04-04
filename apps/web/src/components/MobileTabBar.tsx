interface MobileTabBarProps {
  windowIds: string[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function MobileTabBar({ windowIds, activeId, onSelect }: MobileTabBarProps) {
  if (windowIds.length < 2) return null;

  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-3 backdrop-blur-md bg-pace-bg/80 border-t border-pace-border">
      {windowIds.map((id, index) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            id === activeId
              ? "bg-pace-accent text-white shadow-lg"
              : "bg-pace-card-inner text-pace-text-secondary hover:bg-pace-border"
          }`}
        >
          W{index + 1}
        </button>
      ))}
    </div>
  );
}
