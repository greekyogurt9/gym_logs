import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="site-header">
          <Link className="brand" href="/">
            My Gym Buddy
          </Link>
          <Link className="button-secondary" href="/new">
            + New
          </Link>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
