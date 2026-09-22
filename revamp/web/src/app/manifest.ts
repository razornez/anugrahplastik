import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anugrah Plastik Back Office",
    short_name: "Anugrah Plastik",
    description: "Ruang kerja Anugrah Plastik untuk prospek, konten, dan insight pemasaran.",
    start_url: "/admin",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#0b2442",
    icons: [{ src: "/icon", sizes: "any", type: "image/png" }],
  };
}
