import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

/** A colour role read from a CSS variable in globals.css (space-separated RGB). */
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...defaultTheme.fontFamily.sans],
      },
      // Colour roles; the values live in globals.css so a brand swap is one file.
      colors: {
        ink: token("ink"),
        muted: token("muted"),
        canvas: token("canvas"),
        surface: token("surface"),
        line: token("line"),
        brand: { DEFAULT: token("brand"), 2: token("brand-2"), deep: token("brand-deep") },
        ai: token("ai"),
        live: token("live"),
        warn: token("warn"),
        stage: {
          DEFAULT: token("stage"),
          raised: token("stage-raised"),
          line: token("stage-line"),
          ink: token("stage-ink"),
          muted: token("stage-muted"),
        },
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
