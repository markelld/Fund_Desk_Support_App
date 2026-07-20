/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f6f7f9",
        panel: "#ffffff",
        sunken: "#fafbfc",
        line: "#e3e6ea",
        "line-2": "#eef0f3",
        ink: "#2f3846",
        muted: "#69707d",
        dim: "#98a0ad",
        slate: {
          DEFAULT: "#3d5a80",
          bg: "#f0f4f9",
          border: "#d3dfec",
        },
        danger: {
          DEFAULT: "#c0392f",
          bg: "#fdf2f1",
          border: "#f0d3d0",
        },
        warn: {
          DEFAULT: "#b7791f",
          bg: "#fdf8ee",
          border: "#eddcbc",
        },
        success: {
          DEFAULT: "#2d7d5a",
          bg: "#f0f8f4",
          border: "#cfe5da",
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
