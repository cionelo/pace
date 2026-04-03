import { describe, it, expect } from "vitest";
import {
  genCustomId,
  generateEvenSplits,
  generateNegativeSplits,
  generatePositiveSplits,
  timeStringToSeconds,
} from "../stores/custom-athlete-store";

describe("genCustomId", () => {
  it("returns a string starting with custom_", () => {
    const id = genCustomId();
    expect(id.startsWith("custom_")).toBe(true);
  });

  it("returns unique values on successive calls", () => {
    const a = genCustomId();
    const b = genCustomId();
    expect(a).not.toBe(b);
  });
});

describe("timeStringToSeconds", () => {
  it("parses mm:ss.ss format", () => {
    expect(timeStringToSeconds("4:00.00")).toBeCloseTo(240);
  });

  it("parses longer times", () => {
    expect(timeStringToSeconds("16:52.10")).toBeCloseTo(1012.1);
  });

  it("parses seconds-only format", () => {
    expect(timeStringToSeconds("60.00")).toBeCloseTo(60);
  });

  it("returns null for empty string", () => {
    expect(timeStringToSeconds("")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(timeStringToSeconds("abc")).toBeNull();
  });
});

describe("generateEvenSplits", () => {
  it("generates 4 even splits for a 4:00 mile", () => {
    const splits = generateEvenSplits(240, 4);
    expect(splits).toHaveLength(4);
    expect(splits[0].lap_s).toBeCloseTo(60);
    expect(splits[3].elapsed_s).toBeCloseTo(240);
  });

  it("generates correct cumulative elapsed times", () => {
    const splits = generateEvenSplits(300, 5);
    expect(splits[0].elapsed_s).toBeCloseTo(60);
    expect(splits[1].elapsed_s).toBeCloseTo(120);
    expect(splits[4].elapsed_s).toBeCloseTo(300);
  });

  it("final split elapsed_s equals totalSeconds exactly", () => {
    const splits = generateEvenSplits(243.7, 7);
    expect(splits[6].elapsed_s).toBe(243.7);
  });

  it("produces valid Split objects", () => {
    const splits = generateEvenSplits(240, 4);
    for (let i = 0; i < splits.length; i++) {
      expect(splits[i].id).toBe(`gen_${i}`);
      expect(splits[i].result_id).toBe("");
      expect(splits[i].label).toBe(`S${i + 1}`);
      expect(splits[i].ordinal).toBe(i);
      expect(splits[i].distance_m).toBeNull();
      expect(splits[i].place).toBeNull();
    }
  });
});

describe("generateNegativeSplits", () => {
  it("second half is faster by the given percentage", () => {
    const splits = generateNegativeSplits(240, 4, 5);
    const firstHalfLap = splits[0].lap_s!;
    const secondHalfLap = splits[2].lap_s!;
    expect(secondHalfLap).toBeLessThan(firstHalfLap);
    expect(splits[3].elapsed_s).toBeCloseTo(240);
  });

  it("all first-half laps are the same", () => {
    const splits = generateNegativeSplits(240, 4, 10);
    expect(splits[0].lap_s).toBeCloseTo(splits[1].lap_s!);
  });

  it("all second-half laps are the same", () => {
    const splits = generateNegativeSplits(240, 4, 10);
    expect(splits[2].lap_s).toBeCloseTo(splits[3].lap_s!);
  });

  it("fast lap is exactly pct% faster than slow lap", () => {
    const pct = 5;
    const splits = generateNegativeSplits(240, 4, pct);
    const slowLap = splits[0].lap_s!;
    const fastLap = splits[2].lap_s!;
    expect(fastLap).toBeCloseTo(slowLap * (1 - pct / 100));
  });

  it("final elapsed equals totalSeconds exactly", () => {
    const splits = generateNegativeSplits(1012.1, 10, 8);
    expect(splits[9].elapsed_s).toBe(1012.1);
  });
});

describe("generatePositiveSplits", () => {
  it("second half is slower by the given percentage", () => {
    const splits = generatePositiveSplits(240, 4, 5);
    const firstHalfLap = splits[0].lap_s!;
    const secondHalfLap = splits[2].lap_s!;
    expect(secondHalfLap).toBeGreaterThan(firstHalfLap);
    expect(splits[3].elapsed_s).toBeCloseTo(240);
  });

  it("all first-half laps are the same", () => {
    const splits = generatePositiveSplits(240, 4, 10);
    expect(splits[0].lap_s).toBeCloseTo(splits[1].lap_s!);
  });

  it("all second-half laps are the same", () => {
    const splits = generatePositiveSplits(240, 4, 10);
    expect(splits[2].lap_s).toBeCloseTo(splits[3].lap_s!);
  });

  it("slow lap is exactly pct% slower than fast lap", () => {
    const pct = 5;
    const splits = generatePositiveSplits(240, 4, pct);
    const fastLap = splits[0].lap_s!;
    const slowLap = splits[2].lap_s!;
    expect(slowLap).toBeCloseTo(fastLap * (1 + pct / 100));
  });

  it("final elapsed equals totalSeconds exactly", () => {
    const splits = generatePositiveSplits(1012.1, 10, 8);
    expect(splits[9].elapsed_s).toBe(1012.1);
  });
});
