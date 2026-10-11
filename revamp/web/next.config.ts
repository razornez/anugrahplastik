import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.DOCGEN_RENDER_MODE === "local_qa" ? ".next-qa" : ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  output: "standalone",
};

export default nextConfig;
