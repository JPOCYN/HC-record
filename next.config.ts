import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate asset namespace lets this app run beside Family Hub without
  // changing the legacy /, /mcp, or OAuth endpoints on its original domain.
  assetPrefix: "/baby-assets",
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/baby-assets/:path*", destination: "/:path*" }];
  },
};

export default nextConfig;
