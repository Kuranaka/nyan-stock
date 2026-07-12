import type { NextConfig } from 'next';

// The LP has no server-side routes. Export static files so Cloudflare Pages can
// publish the `out` directory directly from its Git integration.
const nextConfig: NextConfig = {
  output: 'export',
  // Static export has no /_next/image endpoint. Serve local public assets directly.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
