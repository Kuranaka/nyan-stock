import type { NextConfig } from 'next';

// The LP has no server-side routes. Export static files so Cloudflare Pages can
// publish the `out` directory directly from its Git integration.
const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
