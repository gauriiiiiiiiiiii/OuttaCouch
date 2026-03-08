import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0b0b0b",
        parchment: "#f7f1e5",
        accent: "#ff6b35",
        ocean: "#2e6f95"
      }
    }
  },
  plugins: []
};

export default config;
