/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  // Theme switching is driven by a `data-theme` attribute on <html> (see
  // src/hooks/useTheme.jsx), not Tailwind's class-based dark: variant —
  // every color below resolves through a CSS custom property that index.css
  // redefines per theme, so component classNames never need a dark: prefix.
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // ---- Surface layers (page / sidebar / card / hover) --------------
        // Kept as "void.900/800/700/600" so every existing bg-void-900 etc.
        // className in the codebase keeps working — only what those tokens
        // *resolve to* changed, via the CSS vars index.css defines per theme.
        void: {
          DEFAULT: "rgb(var(--void-900) / <alpha-value>)",
          950: "rgb(18 18 18 / <alpha-value>)", // deep dark surface
          900: "rgb(var(--void-900) / <alpha-value>)", // page background
          800: "rgb(var(--void-800) / <alpha-value>)", // sidebar / navbar
          700: "rgb(var(--void-700) / <alpha-value>)", // card / panel / input
          600: "rgb(var(--void-600) / <alpha-value>)", // hover surface
          500: "rgb(var(--void-500) / <alpha-value>)", // strong border tone
        },
        // ---- Text — overrides Tailwind's built-in slate scale so every
        // existing text-slate-* className is theme-aware without edits.
        slate: {
          50: "rgb(var(--text-100) / <alpha-value>)",
          100: "rgb(var(--text-100) / <alpha-value>)",
          200: "rgb(var(--text-100) / <alpha-value>)",
          300: "rgb(var(--text-200) / <alpha-value>)",
          400: "rgb(var(--text-300) / <alpha-value>)",
          500: "rgb(var(--text-400) / <alpha-value>)",
          600: "rgb(var(--text-500) / <alpha-value>)",
          700: "rgb(var(--text-500) / <alpha-value>)",
          800: "rgb(var(--border-strong) / <alpha-value>)",
          900: "rgb(var(--border-strong) / <alpha-value>)",
        },
        // ---- Hairline borders / subtle fills — replaces the old
        // border-white/N, bg-white/N idiom used throughout every component.
        line: "rgb(var(--border) / <alpha-value>)",
        hover: "rgb(var(--void-600) / <alpha-value>)",
        // ---- Primary accent (brand blue) ---------------------------------
        neon: {
          50: "rgb(var(--accent-50) / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
        },
        // ---- Secondary accent (violet) — decorative / chart use ----------
        volt: {
          200: "rgb(var(--volt-200) / <alpha-value>)",
          300: "rgb(var(--volt-300) / <alpha-value>)",
          400: "rgb(var(--volt-400) / <alpha-value>)",
          500: "rgb(var(--volt-500) / <alpha-value>)",
          600: "rgb(var(--volt-600) / <alpha-value>)",
          700: "rgb(var(--volt-700) / <alpha-value>)",
        },
        // ---- Tertiary accent (cyan) — chart highlights --------------------
        aqua: {
          300: "rgb(var(--aqua-300) / <alpha-value>)",
          400: "rgb(var(--aqua-400) / <alpha-value>)",
          500: "rgb(var(--aqua-500) / <alpha-value>)",
        },
        // ---- Semantic verdict colors — fake / genuine / uncertain ---------
        threat: "rgb(var(--danger) / <alpha-value>)",
        clear: "rgb(var(--success) / <alpha-value>)",
        caution: "rgb(var(--warning) / <alpha-value>)",
      },
      boxShadow: {
        // Flat, neutral shadows — no colored glow. A ChatGPT-style surface
        // reads as "elevated" from a soft neutral shadow and a 1px border,
        // never from a blue/violet bloom.
        card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px -6px rgba(0,0,0,0.12)",
        lift: "0 4px 16px -8px rgba(0,0,0,0.18)",
        "glow-sm": "0 0 0 1px rgb(var(--border))",
        tile: "0 1px 2px rgba(0,0,0,0.06)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.14s ease-out",
        shimmer: "shimmer 1.6s infinite",
        floaty: "floaty 6s ease-in-out infinite",
      },
      backgroundImage: {
        // Defined as single-color "gradients" (both stops = the same var)
        // rather than removed outright — every bg-neon-gradient /
        // bg-volt-gradient / bg-hero-gradient className across the app
        // keeps working, it just renders as a flat fill now instead of a
        // visible gradient, matching the flat ChatGPT aesthetic without
        // touching every file that references these classes.
        "card-wash": "linear-gradient(180deg, rgb(var(--void-700)) 0%, rgb(var(--void-700)) 100%)",
        "neon-gradient": "linear-gradient(135deg, rgb(var(--accent-500)) 0%, rgb(var(--accent-500)) 100%)",
        "volt-gradient": "linear-gradient(135deg, rgb(var(--volt-500)) 0%, rgb(var(--volt-500)) 100%)",
        "hero-gradient": "linear-gradient(135deg, rgb(var(--accent-500)) 0%, rgb(var(--accent-600)) 100%)",
      },
    },
  },
  plugins: [],
};
