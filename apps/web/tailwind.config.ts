import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"Archivo Black"', "system-ui", "sans-serif"],
        body: ['"Work Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        pace: {
          bg: "rgb(var(--pace-bg) / <alpha-value>)",
          card: "rgb(var(--pace-card) / <alpha-value>)",
          "card-inner": "rgb(var(--pace-card-inner) / <alpha-value>)",
          input: "rgb(var(--pace-input) / <alpha-value>)",
          border: "rgb(var(--pace-border) / <alpha-value>)",
          "border-subtle": "rgb(var(--pace-border-subtle) / <alpha-value>)",
          text: "rgb(var(--pace-text) / <alpha-value>)",
          "text-secondary": "rgb(var(--pace-text-secondary) / <alpha-value>)",
          "text-muted": "rgb(var(--pace-text-muted) / <alpha-value>)",
          accent: "rgb(var(--pace-accent) / <alpha-value>)",
          "accent-hover": "rgb(var(--pace-accent-hover) / <alpha-value>)",
          "accent-subtle": "rgb(var(--pace-accent-subtle) / <alpha-value>)",
        },
      },
      boxShadow: {
        pace: "var(--pace-shadow)",
        "pace-lg": "var(--pace-shadow-lg)",
      },
    },
  },
  plugins: [],
} satisfies Config;
