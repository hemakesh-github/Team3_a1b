import { defineConfig } from "vite";

// Proxy requests to Express so browser and API share one development origin.
export default defineConfig({
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
});
