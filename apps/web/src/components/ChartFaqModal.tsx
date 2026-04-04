import { useState } from "react";

const CHART_FAQS = [
  {
    name: "Virtual Gap",
    description:
      "Shows how each athlete's pacing deviates from a perfectly even effort across the race. The zero line represents an idealized even-pace finish at the average field time. Peaks mean slower laps; valleys mean faster laps. Use this to spot surges, slowdowns, and who was working hardest at each point.",
  },
  {
    name: "Lap Pace",
    description:
      "Displays the raw lap-by-lap split time for each athlete in mm:ss format. Lower on the Y-axis is faster. Use this to see absolute speed at each segment — useful for identifying kick pace, early blazing laps, or the exact splits that decided a race.",
  },
  {
    name: "Position",
    description:
      "Shows each athlete's race position (rank among visible athletes) at every split, with rank 1 at the top. Use this to see tactical moves — when an athlete moved through the field, held position, or got dropped — which raw split times alone cannot reveal.",
  },
  {
    name: "Time Gain/Loss",
    description:
      "Shows per-segment time gained or lost relative to the field average pace for that segment. Negative values mean the athlete ran that lap faster than average; positive means slower. Unlike Virtual Gap (cumulative), this isolates each individual lap so you can pinpoint the exact segment that decided the race.",
  },
] as const;

export default function ChartFaqModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-6 h-6 flex items-center justify-center rounded-full border border-pace-border text-pace-text-muted hover:text-pace-text hover:border-pace-text-secondary text-xs leading-none transition-all duration-300 flex-shrink-0"
        title="Chart view explanations"
        aria-label="Chart FAQ"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-pace-card border border-pace-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-pace-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg text-pace-text">Chart Views</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-pace-text-muted hover:text-pace-text transition-colors duration-300 text-xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-5">
              {CHART_FAQS.map((faq) => (
                <div key={faq.name}>
                  <p className="text-sm font-medium text-pace-text mb-1">
                    {faq.name}
                  </p>
                  <p className="text-xs text-pace-text-secondary leading-relaxed">
                    {faq.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
