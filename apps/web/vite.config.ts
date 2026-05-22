import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || process.env.PORT || 5200),
    strictPort: false,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY || "http://localhost:8010",
        changeOrigin: true,
      },
    },
  },
});
