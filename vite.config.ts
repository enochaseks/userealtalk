// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["pwa-192.png", "pwa-512.png", "apple-touch-icon.png"],
        manifest: {
          name: "RealTalk",
          short_name: "RealTalk",
          description: "Your AI-powered mental wellness companion",
          theme_color: "#0f0f0f",
          background_color: "#0f0f0f",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            {
              src: "pwa-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          // Cache the app shell and all static assets
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          // Don't cache Supabase API calls or edge function calls
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api/, /^\/supabase/, /^\/functions/],
          runtimeCaching: [
            {
              // Supabase API — network first, fall back to cache
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-cache",
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24, // 1 day
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Images — cache first
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache",
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
          ],
        },
      }),
    ],
  },
});
