import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baby Record",
    short_name: "Baby Record",
    description: "Private daily baby care and growth records.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7efe9",
    theme_color: "#f7efe9",
    orientation: "portrait",
    icons: [
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
