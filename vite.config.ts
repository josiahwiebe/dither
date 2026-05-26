import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es"
  },
  build: {
    target: "esnext",
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const [, pkg] = id.split("node_modules/");
          const [scopeOrName, maybeName] = pkg.split("/");
          return scopeOrName.startsWith("@")
            ? `vendor-${scopeOrName.slice(1)}-${maybeName}`
            : `vendor-${scopeOrName}`;
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**", "out/**", "release/**"],
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/components/**/*.vitest.tsx"],
    setupFiles: ["./tests/setup.ts"]
  }
});
