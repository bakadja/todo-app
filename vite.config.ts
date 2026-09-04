import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",
      manifest: {
        name: "Todo Pop",
        short_name: "Todo Pop",
        display: "standalone",
        start_url: "/",
        theme_color: "#ffffff",
        background_color: "#ffffff",
      },
      workbox: {
        navigateFallback: "/index.html",
      },
    }),
  ],
  test: {
    environment: "jsdom",
  },
});
