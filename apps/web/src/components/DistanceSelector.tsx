import { useEffect, useState } from "react";
import { getDistances } from "../lib/db";

interface DistanceSelectorProps {
  value: string | null;
  onChange: (distance: string) => void;
}

export default function DistanceSelector({ value, onChange }: DistanceSelectorProps) {
  const [distances, setDistances] = useState<string[]>([]);

  useEffect(() => {
    getDistances().then(setDistances).catch(console.error);
  }, []);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
    >
      <option value="" disabled>
        Select distance...
      </option>
      {distances.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
