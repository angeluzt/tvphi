import type { Config } from "tailwindcss";

/**
 * Sistema de diseño TVPHI.
 * Paleta oscura por defecto, moderna y agradable:
 *  - brand (violeta) como color principal
 *  - accent (cian) para acciones/vivo
 *  - gold para puntos/dinero
 * Los valores concretos viven como variables CSS en globals.css para permitir temas.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          soft: "rgb(var(--brand-soft) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
        gold: "rgb(var(--gold) / <alpha-value>)",
        live: "rgb(var(--live) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--brand) / 0.35), 0 8px 40px -12px rgb(var(--brand) / 0.45)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 10px 30px -18px rgb(0 0 0 / 0.8)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "alert-in": {
          "0%": { opacity: "0", transform: "translateY(-20px) scale(0.96)" },
          "12%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "88%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-12px) scale(0.98)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out both",
        "alert-in": "alert-in var(--alert-duration, 6s) ease-in-out both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-live": "pulse-live 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
