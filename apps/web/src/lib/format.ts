const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDateHuman(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  const day = parseInt(d, 10);
  return `${MONTH_NAMES[monthIdx]} ${day}, ${y}`;
}

export function genderShorthand(gender: string): string {
  return gender === "Men" ? "M" : "W";
}

const SEASON_DISPLAY: Record<string, string> = {
  indoor: "Indoor",
  outdoor: "Outdoor",
  xc: "XC",
};

// Strip embedded dates/years from event names to prevent double-date display.
// Removes patterns like "Jan 12, 2025", "February 8", "2025", "2024-2025".
function stripDatesFromName(name: string): string {
  return name
    // Full month-day-year: "February 8, 2025" or "Feb 8, 2025"
    .replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s*\d{4})?\b/gi, "")
    // Standalone year: " 2024" or " 2025" (but not distances like "5000")
    .replace(/\b20\d{2}(?:-20\d{2})?\b/g, "")
    // Clean up trailing punctuation/dashes/spaces left behind
    .replace(/[-–—,]+\s*$/, "")
    .replace(/\s+[-–—]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Detect prelim/final round from event name.
export function extractRound(name: string): "Prelim" | "Final" | null {
  const lower = name.toLowerCase();
  if (/\bprelim(inary)?\b/.test(lower)) return "Prelim";
  if (/\bfinal(s)?\b/.test(lower)) return "Final";
  return null;
}

interface RaceDisplayInput {
  conferenceName?: string | null;
  eventName?: string;
  season: string | null;
  gender: string;
  distance: string;
  date: string | null;
}

export function formatRaceDisplay(input: RaceDisplayInput): string {
  const useConference = input.conferenceName != null;
  const rawPrefix = useConference ? input.conferenceName! : (input.eventName ?? "");
  // Strip embedded dates from the name so we never show the date twice
  const prefix = stripDatesFromName(rawPrefix);
  const season = useConference && input.season ? SEASON_DISPLAY[input.season] ?? "" : "";
  const label = [prefix, season].filter(Boolean).join(" ");
  const g = genderShorthand(input.gender);
  const dateStr = formatDateHuman(input.date);
  return [label, `${g} ${input.distance}`, dateStr].filter(Boolean).join(" · ");
}
