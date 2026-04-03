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
  const prefix = useConference ? input.conferenceName! : (input.eventName ?? "");
  const season = useConference && input.season ? SEASON_DISPLAY[input.season] ?? "" : "";
  const label = [prefix, season].filter(Boolean).join(" ");
  const g = genderShorthand(input.gender);
  const dateStr = formatDateHuman(input.date);
  return [label, `${g} ${input.distance}`, dateStr].filter(Boolean).join(" · ");
}
