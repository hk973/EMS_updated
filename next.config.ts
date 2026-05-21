import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // output: 'export',
  // trailingSlash: true,
  // Suppress the /_error page not found error from opennextjs-cloudflare
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
// const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: true });
// module.exports = withBundleAnalyzer({});

export default nextConfig;
