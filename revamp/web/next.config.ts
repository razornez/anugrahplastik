import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.DOCGEN_RENDER_MODE === "local_qa" ? ".next-qa" : ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  experimental: {
    // Private design uploads allow source files up to 100 MiB. Leave room for
    // multipart headers so Proxy does not truncate the request before the route.
    proxyClientMaxBodySize: "105mb",
  },
  outputFileTracingIncludes: {
    "/api/admin/three/draco/*": ["./node_modules/three/examples/jsm/libs/draco/gltf/**/*"],
    "/api/admin/three/occt/*": ["./node_modules/occt-import-js/dist/**/*"],
  },
  output: "standalone",
};

export default nextConfig;
