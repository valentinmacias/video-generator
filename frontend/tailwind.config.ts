import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // TikTok Symphony Studio palette
        tt: {
          bg:      "#08080f",
          surface: "#0f0f1a",
          card:    "#141420",
          border:  "#1e1e30",
          hover:   "#1a1a2a",
          accent:  "#00d4b8",   // teal
          blue:    "#4f7eff",   // electric blue
          purple:  "#8b5cf6",   // violet
          pink:    "#ec4899",
          text:    "#f0f0ff",
          muted:   "#6b7280",
          dim:     "#3d3d52",
        },
        // Keep legacy surface for backward compat
        brand: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          300: "#7dd3fc",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
        },
        surface: {
          DEFAULT: "#08080f",
          card:    "#141420",
          border:  "#1e1e30",
          muted:   "#6b7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      animation: {
        shimmer:       "shimmer 1.8s infinite linear",
        "fade-in":     "fadeIn 0.4s ease-out",
        "slide-up":    "slideUp 0.35s ease-out",
        "slide-in":    "slideIn 0.35s ease-out",
        progress:      "progress 2.5s ease-in-out infinite",
        "pulse-ring":  "pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow":   "spin 3s linear infinite",
        glow:          "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%":   { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        progress: {
          "0%":   { width: "5%" },
          "50%":  { width: "75%" },
          "100%": { width: "95%" },
        },
        pulseRing: {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0.4" },
        },
        glow: {
          "0%":   { boxShadow: "0 0 5px rgba(0, 212, 184, 0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(0, 212, 184, 0.8), 0 0 40px rgba(0, 212, 184, 0.3)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        "glow-accent": "0 0 20px rgba(0, 212, 184, 0.3)",
        "glow-blue":   "0 0 20px rgba(79, 126, 255, 0.3)",
        "card-hover":  "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255,255,255,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
