import type { MetadataRoute } from "next";

// Web app manifest (Next.js metadata route, served at /manifest.webmanifest).
// Makes the site installable: name, icons, standalone display. The `id`
// pins the install identity so future start_url tweaks don't create a
// duplicate app on users' home screens.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Gym Buddy",
    short_name: "Gym Buddy",
    description: "Minimal workout logger: workout, exercise, set, weight, reps.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f1",
    theme_color: "#faf7f1",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
