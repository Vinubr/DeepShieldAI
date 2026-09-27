import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = "http://127.0.0.1:8000";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The frontend never talks to models directly — only to FastAPI.
      "/api": { target: API_TARGET, changeOrigin: true },
      // Swagger UI is linked from the navbar user menu; without these two
      // entries that link would 404 against the Vite dev server.
      "/docs": { target: API_TARGET, changeOrigin: true },
      "/openapi.json": { target: API_TARGET, changeOrigin: true },
    },
  },
});
