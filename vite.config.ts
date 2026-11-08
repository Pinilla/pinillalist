/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3100",
      "/photos": "http://127.0.0.1:3100",
    },
  },
  test: {
    root: ".",
    include: ["src/**/*.test.ts", "tests/api/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
