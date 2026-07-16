# Pathpad

Paste text on one device, open the same link on another.

## Everyday flow

1. Open Pathpad → tap **Quick note** (or type a path like `/todo`)
2. Enter your password **once per device**
3. Type or paste
4. Tap **Copy link** → open it on your phone/PC

Notes autosave. Stay signed in until you hit **Lock**.

## Features (quietly in the background)

* One password, HttpOnly session
* Client-side encryption
* Autosave + local draft backup
* Recent notes
* More menu: Markdown preview, download, trash, lock
* Optional share password (for one path without master password)
* PWA installable

## Setup

```env
NOTE_PASSWORD=your-password
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

```bash
npm install
npm run dev
```

## Deploy

```bash
vercel --prod
```

Not for banking secrets or private keys — treat it like a shared personal notepad.
