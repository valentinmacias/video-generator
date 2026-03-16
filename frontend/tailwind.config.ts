import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        surface: {
          DEFAULT: "#0f172a",
          card: "#1e293b",
          border: "#334155",
          muted: "#475569",
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite linear",
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        progress: "progress 2.5s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        progress: {
          "0%": { width: "5%" },
          "50%": { width: "75%" },
          "100%": { width: "95%" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
