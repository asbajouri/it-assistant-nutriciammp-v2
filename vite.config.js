import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // مسیر نسبی — هم روی ریشه‌ی دامنه (Vercel) هم روی زیرمسیر (GitHub Pages: username.github.io/repo-name/) درست کار می‌کنه
  build: {
    outDir: "dist",
  },
});
