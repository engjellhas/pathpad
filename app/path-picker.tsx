'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const examples = ['engj', 'ideas', 'todo', 'links'];

export default function PathPicker() {
  const router = useRouter();
  const [path, setPath] = useState('');

  function goToNote(event: React.FormEvent) {
    event.preventDefault();
    const slug = path.trim().replace(/^\/+/, '').replace(/\/+/g, '-');
    if (!slug) return;
    router.push(`/${slug}`);
  }

  return (
    <div className="path-picker">
      <form className="path-form" onSubmit={goToNote}>
        <span className="path-prefix">/</span>
        <input
          autoFocus
          type="text"
          placeholder="your-note"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          spellCheck={false}
        />
        <button type="submit">Open</button>
      </form>

      <div className="examples">
        <span className="examples-label">Try</span>
        {examples.map((example) => (
          <Link key={example} className="example-chip" href={`/${example}`}>
            /{example}
          </Link>
        ))}
      </div>
    </div>
  );
}
