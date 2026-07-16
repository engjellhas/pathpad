import { Suspense } from 'react';
import PathPicker from './path-picker';

export default function HomePage() {
  return (
    <main className="home">
      <section>
        <p className="eyebrow">Pathpad</p>
        <h1>Your private notepad on any URL path.</h1>
        <p className="muted">
          Encrypted notes, session auth, search, trash, and optional share passwords — still just a
          path and a password.
        </p>

        <Suspense fallback={<p className="muted">Loading…</p>}>
          <PathPicker />
        </Suspense>

        <ol className="steps">
          <li>Unlock once — HttpOnly session, no password in localStorage</li>
          <li>Open any path like <code>/ideas</code> — notes encrypt before they leave the browser</li>
          <li>Search, trash, share one path, preview Markdown, install as PWA</li>
        </ol>
      </section>
    </main>
  );
}
