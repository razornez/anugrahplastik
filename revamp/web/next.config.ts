import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  output: "standalone",
};

export default nextConfig;
