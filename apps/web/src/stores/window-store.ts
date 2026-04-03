import { create } from "zustand";
import type { AthleteResult, WindowAthleteData } from "../types/pace";
import { ATHLETE_COLORS, MAX_ATHLETES_PER_WINDOW, MAX_WINDOWS } from "../lib/constants";

export interface PaceWindow {
  id: string;
  athletes: WindowAthleteData[];
}

interface WindowStore {
  windows: PaceWindow[];
  addWindow: () => string | null;
  removeWindow: (windowId: string) => void;
  resetWindow: (windowId: string) => void;
  addAthlete: (windowId: string, athleteResult: AthleteResult) => boolean;
  removeAthlete: (windowId: string, athleteId: string) => void;
  toggleAthleteVisibility: (windowId: string, athleteId: string) => void;
}

let nextId = 0;
function genId() {
  return `win_${++nextId}`;
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],

  addWindow: () => {
    const { windows } = get();
    if (windows.length >= MAX_WINDOWS) return null;
    const id = genId();
    set({ windows: [...windows, { id, athletes: [] }] });
    return id;
  },

  removeWindow: (windowId) => {
    set({ windows: get().windows.filter((w) => w.id !== windowId) });
  },

  resetWindow: (windowId) => {
    set({
      windows: get().windows.map((w) =>
        w.id === windowId ? { ...w, athletes: [] } : w
      ),
    });
  },

  addAthlete: (windowId, athleteResult) => {
    const { windows } = get();
    const win = windows.find((w) => w.id === windowId);
    if (!win) return false;
    if (win.athletes.length >= MAX_ATHLETES_PER_WINDOW) return false;

    const already = win.athletes.some(
      (a) =>
        a.athleteResult.athlete.id === athleteResult.athlete.id &&
        a.athleteResult.result.id === athleteResult.result.id
    );
    if (already) return false;

    const colorIndex = win.athletes.length;
    const newAthlete: WindowAthleteData = {
      athleteResult,
      color: ATHLETE_COLORS[colorIndex],
      visible: true,
    };

    set({
      windows: windows.map((w) =>
        w.id === windowId
          ? { ...w, athletes: [...w.athletes, newAthlete] }
          : w
      ),
    });
    return true;
  },

  removeAthlete: (windowId, athleteId) => {
    set({
      windows: get().windows.map((w) => {
        if (w.id !== windowId) return w;
        const filtered = w.athletes.filter(
          (a) => a.athleteResult.athlete.id !== athleteId
        );
        // Reassign colors to maintain positional order
        return {
          ...w,
          athletes: filtered.map((a, i) => ({ ...a, color: ATHLETE_COLORS[i] })),
        };
      }),
    });
  },

  toggleAthleteVisibility: (windowId, athleteId) => {
    set({
      windows: get().windows.map((w) => {
        if (w.id !== windowId) return w;
        return {
          ...w,
          athletes: w.athletes.map((a) =>
            a.athleteResult.athlete.id === athleteId
              ? { ...a, visible: !a.visible }
              : a
          ),
        };
      }),
    });
  },
}));
