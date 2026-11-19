import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sceneform — สตูดิโอเขียนบท",
    short_name: "Sceneform",
    description: "จัดการโปรเจกต์บทภาพยนตร์ได้ทุกที่ แม้ออฟไลน์",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8fc",
    theme_color: "#f8f8fc",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
