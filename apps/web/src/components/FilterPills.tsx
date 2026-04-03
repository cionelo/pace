interface FilterPillsProps {
  gender: "" | "Men" | "Women";
  division: "" | "D1" | "D2";
  onGenderChange: (g: "" | "Men" | "Women") => void;
  onDivisionChange: (d: "" | "D1" | "D2") => void;
}

const GENDER_OPTIONS = [
  { value: "" as const, label: "All" },
  { value: "Men" as const, label: "M" },
  { value: "Women" as const, label: "W" },
];

const DIVISION_OPTIONS = [
  { value: "" as const, label: "All" },
  { value: "D1" as const, label: "D1" },
  { value: "D2" as const, label: "D2" },
];

function PillGroup<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-700 text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`px-2 py-1 transition-colors ${
            selected === opt.value
              ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function FilterPills({
  gender,
  division,
  onGenderChange,
  onDivisionChange,
}: FilterPillsProps) {
  return (
    <div className="flex items-center gap-2">
      <PillGroup options={GENDER_OPTIONS} selected={gender} onChange={onGenderChange} />
      <PillGroup options={DIVISION_OPTIONS} selected={division} onChange={onDivisionChange} />
    </div>
  );
}
