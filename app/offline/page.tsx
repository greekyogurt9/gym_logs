import Link from "next/link";

// Offline fallback served by the service worker when a navigation has no
// network. Logged data is safe (localStorage / cloud sync on reconnect);
// only new page loads need the connection back.

export default function OfflinePage() {
  return (
    <div className="empty">
      <h1>You&apos;re offline</h1>
      <p className="muted">
        No connection — your logged workouts are safe on this device and will sync when
        you&apos;re back online.
      </p>
      <Link className="button" href="/">
        Back to history
      </Link>
    </div>
  );
}
