"use client";

import { useEffect } from "react";

// Registers the service worker in production only. Dev (`next dev`) is
// excluded on purpose: cached shells during development hide the code you
// just wrote. Prod-mode verification (`next build && next start`) exercises
// the real worker before every release.

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is a bonus, not a requirement — never break the app over it.
      });
    }
  }, []);

  return null;
}
