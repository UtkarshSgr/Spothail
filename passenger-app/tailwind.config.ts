import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Seat Status Transit Radar Colors
        radar: {
          empty: {
            DEFAULT: "#10b981", // Emerald 500 (Empty: 0/4)
            light: "#34d399",
            dark: "#059669",
            glow: "rgba(16, 185, 129, 0.35)",
            dimmed: "#064e3b",
          },
          hasSpace: {
            DEFAULT: "#f59e0b", // Amber 500 (Has space: 1-3/4)
            light: "#fbbf24",
            dark: "#d97706",
            glow: "rgba(245, 158, 11, 0.35)",
            dimmed: "#78350f",
          },
          full: {
            DEFAULT: "#ef4444", // Red 500 (Full: 4/4)
            light: "#f87171",
            dark: "#b91c1c",
            glow: "rgba(239, 68, 68, 0.35)",
            dimmed: "#7f1d1d", // Dimmed red
          },
        },
        seat: {
          empty: "#10b981",
          space: "#f59e0b",
          hasSpace: "#f59e0b",
          full: "#ef4444",
          dimmed: "#7f1d1d",
        },
      },
      zIndex: {
        // 3-layer architecture scale
        "10": "10",
        "20": "20",
        "30": "30",
        map: "10",
        drawer: "20",
        "bottom-sheet": "20",
        command: "30",
        "command-bar": "30",
      },
      animation: {
        "radar-pulse": "radarPulse 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "ping-slow": "ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      keyframes: {
        radarPulse: {
          "0%": { transform: "scale(0.95)", opacity: "0.8" },
          "50%": { transform: "scale(1.15)", opacity: "0.3" },
          "100%": { transform: "scale(0.95)", opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
