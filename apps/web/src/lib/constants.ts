export const ATHLETE_COLORS = [
  "#2563EB", // blue
  "#DC2626", // red
  "#16A34A", // green
  "#9333EA", // purple
  "#EA580C", // orange
  "#0891B2", // cyan
  "#CA8A04", // yellow
  "#DB2777", // pink
  "#4F46E5", // indigo
  "#059669", // emerald
] as const;

export const MAX_ATHLETES_PER_WINDOW = 10;
export const MAX_WINDOWS = 6;

export const ALLOWED_DISTANCES = [
  "800m", "1500m", "Mile", "3000m", "5000m", "10,000m",
  "5K", "8K", "10K", "DMR", "4xMile",
] as const;
