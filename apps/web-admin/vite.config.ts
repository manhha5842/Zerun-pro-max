import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react() as any],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001"
    }
  }
});
