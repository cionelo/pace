const DISTANCES = [
  "800m", "1500m", "Mile", "3000m", "5000m", "10,000m",
  "5K", "8K", "10K", "DMR", "4xMile",
] as const;

export type Distance = typeof DISTANCES[number];

interface FilterPillsProps {
  gender: "" | "Men" | "Women";
  division: "" | "D1" | "D2";
  distance: "" | Distance;
  onGenderChange: (g: "" | "Men" | "Women") => void;
  onDivisionChange: (d: "" | "D1" | "D2") => void;
  onDistanceChange: (d: "" | Distance) => void;
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
    <div className="flex rounded-full overflow-hidden border border-pace-border text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`px-3.5 py-1.5 font-medium transition-all duration-300 ${
            selected === opt.value
              ? "bg-pace-text text-pace-bg"
              : "text-pace-text-muted hover:text-pace-text"
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
  distance,
  onGenderChange,
  onDivisionChange,
  onDistanceChange,
}: FilterPillsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <PillGroup options={GENDER_OPTIONS} selected={gender} onChange={onGenderChange} />
      <PillGroup options={DIVISION_OPTIONS} selected={division} onChange={onDivisionChange} />
      <select
        value={distance}
        onChange={(e) => onDistanceChange(e.target.value as "" | Distance)}
        className="text-xs font-medium bg-pace-card border border-pace-border text-pace-text-muted rounded-full px-3 py-1.5 focus:outline-none focus:border-pace-accent transition-all duration-300 appearance-none cursor-pointer"
      >
        <option value="">All distances</option>
        {DISTANCES.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}
