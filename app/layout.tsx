import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import ServiceWorkerRegister from "@/components/sw-register";
import TabBar from "@/components/tab-bar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My Gym Buddy",
  description: "Minimal workout logger: workout → exercise → set → weight × reps.",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gym Buddy",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf7f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ServiceWorkerRegister />
        <header className="site-header">
          <Link className="brand" href="/">
            My Gym Buddy
          </Link>
        </header>
        <main className="container">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
