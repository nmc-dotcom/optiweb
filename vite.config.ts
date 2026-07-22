import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // In `vite dev`, forward /api to a locally-running `wrangler pages dev`
      // instance so the Pages Function (functions/api/fetch.ts) is reachable
      // without needing to run the whole app through wrangler.
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
});
