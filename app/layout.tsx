import type { Metadata, Viewport } from "next";
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@fontsource/courier-prime/latin-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sceneform — สตูดิโอเขียนบท",
  description: "พื้นที่จัดการโปรเจกต์บทภาพยนตร์ที่ทำงานได้แม้ออฟไลน์",
  applicationName: "Sceneform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Sceneform", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
  themeColor: "#f8f8fc",
};

const initializeTheme = `
try {
  const stored = JSON.parse(localStorage.getItem("sceneform-appearance") || "null");
  const theme = stored?.state?.theme;
  const dark = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#151320" : "#f8f8fc");
} catch {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initializeTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
