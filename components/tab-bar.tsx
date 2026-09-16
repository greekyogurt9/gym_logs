"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Bottom tab bar: the only primary navigation. Fixed to the viewport bottom
// (thumb zone), 60px targets, safe-area aware. Three tabs on purpose —
// everything else lives one tap deeper (detail, exercise, account pages).

const TABS = [
  { href: "/new", label: "Log", match: (p: string) => p === "/new" || p.startsWith("/workout/") },
  {
    href: "/",
    label: "History",
    match: (p: string) => p === "/" || p.startsWith("/workouts/") || p.startsWith("/exercises/"),
  },
  {
    href: "/calendar",
    label: "Calendar",
    match: (p: string) => p.startsWith("/calendar"),
  },
  { href: "/account", label: "You", match: (p: string) => p.startsWith("/account") },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.match(pathname) ? "page" : undefined}
        >
          <span className="tab-dot" aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
