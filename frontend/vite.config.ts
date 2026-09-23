/// <reference types="vitest" />
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" keeps asset and data URLs relative, so the built site runs from any folder
// or static host (routing is hash-based for the same reason).
export default defineConfig({
  base: "./",
  plugins: [react()],
  // IPv4 loopback: the local Caddy proxy (http://solar-dev.localhost:8080) dials 127.0.0.1,
  // and Node's default "localhost" can bind to IPv6 [::1] only.
  server: { host: "127.0.0.1", port: 5173 },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
