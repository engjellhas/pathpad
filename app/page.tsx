import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="home">
      <section>
        <p className="eyebrow">Private Notes</p>
        <h1>Open any path and use it as a private note.</h1>
        <p className="muted">
          Example: <code>/engj</code>, <code>/ideas</code>, <code>/client-copy</code>
        </p>
        <Link className="button" href="/engj">Open /engj</Link>
      </section>
    </main>
  );
}
