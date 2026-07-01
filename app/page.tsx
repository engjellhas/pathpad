import PathPicker from './path-picker';

export default function HomePage() {
  return (
    <main className="home">
      <section>
        <p className="eyebrow">Pathpad</p>
        <h1>Your private notepad on any URL path.</h1>
        <p className="muted">
          Pick a path, enter your password once, and start typing. Notes autosave and sync across
          your devices.
        </p>

        <PathPicker />

        <ol className="steps">
          <li>Type a path like <code>/ideas</code> or <code>/todo</code></li>
          <li>Unlock with your shared password</li>
          <li>Write — it saves automatically</li>
        </ol>
      </section>
    </main>
  );
}
