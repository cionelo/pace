import { describe, it, expect } from "vitest";
import {
  formatRaceDisplay,
  formatDateHuman,
  genderShorthand,
} from "../lib/format";

describe("formatDateHuman", () => {
  it("formats ISO date to human readable", () => {
    expect(formatDateHuman("2026-02-28")).toBe("Feb 28, 2026");
  });

  it("returns empty string for null", () => {
    expect(formatDateHuman(null)).toBe("");
  });
});

describe("genderShorthand", () => {
  it("converts Men to M", () => {
    expect(genderShorthand("Men")).toBe("M");
  });

  it("converts Women to W", () => {
    expect(genderShorthand("Women")).toBe("W");
  });
});

describe("formatRaceDisplay", () => {
  it("returns condensed format with conference", () => {
    expect(
      formatRaceDisplay({
        conferenceName: "Big 12",
        season: "indoor",
        gender: "Women",
        distance: "800m",
        date: "2026-02-28",
      })
    ).toBe("Big 12 Indoor · W 800m · Feb 28, 2026");
  });

  it("falls back to event name when no conference", () => {
    expect(
      formatRaceDisplay({
        conferenceName: null,
        eventName: "Razorback Invitational",
        season: "indoor",
        gender: "Men",
        distance: "Mile",
        date: "2026-01-15",
      })
    ).toBe("Razorback Invitational · M Mile · Jan 15, 2026");
  });

  it("capitalizes season", () => {
    expect(
      formatRaceDisplay({
        conferenceName: "SEC",
        season: "outdoor",
        gender: "Men",
        distance: "5000m",
        date: "2026-05-10",
      })
    ).toBe("SEC Outdoor · M 5000m · May 10, 2026");
  });

  it("handles xc season", () => {
    expect(
      formatRaceDisplay({
        conferenceName: "Sun Belt",
        season: "xc",
        gender: "Women",
        distance: "5K",
        date: "2025-10-31",
      })
    ).toBe("Sun Belt XC · W 5K · Oct 31, 2025");
  });
});
