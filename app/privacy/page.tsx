import Link from "next/link";

// Plain-language privacy notice. Required for any future store listing,
// useful for trust right now. If the data practices change, update this
// page in the same PR as the code change — never let them drift apart.

export default function PrivacyPage() {
  return (
    <div>
      <Link className="back" href="/">
        ← History
      </Link>
      <h1>Privacy</h1>
      <p className="muted">Effective September 2026.</p>

      <section className="card">
        <h2>What we collect</h2>
        <ul className="sets">
          <li>Workouts you enter: titles, exercise names, weights, reps, dates.</li>
          <li>If you sign in with Google: your email address, to identify your account.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Where it lives</h2>
        <ul className="sets">
          <li>Signed out: only in your browser&apos;s local storage, on your device.</li>
          <li>Signed in: in a Supabase-hosted PostgreSQL database, isolated per
            account by database-level access rules (Row Level Security).</li>
        </ul>
      </section>

      <section className="card">
        <h2>What we never do</h2>
        <ul className="sets">
          <li>No ads, no analytics, no tracking.</li>
          <li>No sale or sharing of your data with anyone.</li>
          <li>No passwords stored — sign-in is handled by Google via Supabase Auth.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Deletion</h2>
        <p>
          Delete workouts anytime in the app. To erase your account data entirely,
          raise an issue at{" "}
          <a
            className="link-danger"
            href="https://github.com/greekyogurt9/gym_logs/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/greekyogurt9/gym_logs/issues
          </a>
          .
        </p>
      </section>
    </div>
  );
}
