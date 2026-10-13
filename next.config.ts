import type { NextConfig } from "next";

// Reel is a dashboard app where nearly every route is user-specific
// (auth-gated via cookies()) rather than static/cacheable content, so we
// opt out of Next 16's Cache Components model (which otherwise requires
// explicit Suspense/`"use cache"` boundaries on every dynamic read) and use
// the traditional per-request dynamic rendering it's designed around.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
