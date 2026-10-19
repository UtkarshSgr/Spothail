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
        radar: {
          empty: {
            DEFAULT: "#10b981", // Emerald (0 seats occupied)
            glow: "rgba(16, 185, 129, 0.4)",
          },
          hasSpace: {
            DEFAULT: "#f59e0b", // Amber (partial)
            glow: "rgba(245, 158, 11, 0.4)",
          },
          full: {
            DEFAULT: "#ef4444", // Crimson / Red (full)
            glow: "rgba(239, 68, 68, 0.4)",
          },
        },
      },
      animation: {
        "ping-slow": "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite",
        "pulse-fast": "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
