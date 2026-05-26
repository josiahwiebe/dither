import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

/** Keeps third-party code out of the Electron renderer entry chunk. */
function vendorChunkName(id: string) {
  if (!id.includes("node_modules")) return undefined;

  const [, packagePath] = id.split("node_modules/");
  if (!packagePath) return undefined;

  const [scopeOrName, maybeName] = packagePath.split("/");
  if (!scopeOrName) return undefined;

  return scopeOrName.startsWith("@")
    ? `vendor-${scopeOrName.slice(1)}-${maybeName}`
    : `vendor-${scopeOrName}`;
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload.ts")
        },
        output: {
          entryFileNames: "[name].cjs",
          format: "cjs"
        }
      }
    }
  },
  renderer: {
    root: ".",
    plugins: [react()],
    worker: {
      format: "es"
    },
    build: {
      modulePreload: false,
      target: "esnext",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html")
        },
        output: {
          manualChunks: vendorChunkName
        }
      }
    }
  }
});
