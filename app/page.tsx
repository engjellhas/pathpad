import { Suspense } from 'react';
import PathPicker from './path-picker';

export default function HomePage() {
  return (
    <main className="home">
      <section>
        <p className="eyebrow">Pathpad</p>
        <h1>Paste here. Open there.</h1>
        <p className="muted">
          Same path on your phone and computer — notes sync as you type. One password, then just
          write.
        </p>

        <Suspense fallback={<p className="muted">Loading…</p>}>
          <PathPicker />
        </Suspense>

        <ol className="steps">
          <li>
            Tap <strong>Quick note</strong> or open <code>/anything</code>
          </li>
          <li>Enter password once on this device</li>
          <li>
            <strong>Copy link</strong> → open on the other device
          </li>
        </ol>
      </section>
    </main>
  );
}
