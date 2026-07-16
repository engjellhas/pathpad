# Pathpad

A private path-based notepad. Open any URL path and use it as a note:

* `/engj`
* `/ideas`
* `/client-copy`
* `/anything`

One master password unlocks everything. Notes are encrypted in the browser before they hit Redis, autosave as you type, and work across devices.

## Features

* **No accounts** — one shared master password
* **HttpOnly session cookie** after unlock (password is not kept in `localStorage`)
* **Rate-limited login**
* **Client-side AES-GCM encryption** (password-derived key)
* **Path-based notes** with server index (cross-device list)
* **Search** (decrypts on-device, then matches)
* **Soft delete + trash** (30-day retention, restore / empty)
* **Per-note share passwords** (open one path without the master password)
* **Markdown preview** (`⌘/Ctrl+E`)
* **Light / dark / system theme**
* **PWA** installable app shell
* **Local draft backup**, download `.txt`, copy link/text
* **Keyboard shortcuts**: `⌘/Ctrl+S` save, `Tab` indent
* Vercel + Upstash Redis ready

## Tech Stack

* Next.js
* React
* Upstash Redis
* Web Crypto (AES-GCM + PBKDF2)

## Environment Variables

```env
NOTE_PASSWORD=your-password
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

Or Vercel KV names:

```env
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

## Run Locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Deploy

```bash
vercel --prod
```

## Security notes

* The master password never leaves the browser after login except to authenticate once and derive the encryption key.
* API auth uses an HttpOnly session cookie stored in Redis (30 days).
* Note bodies are encrypted client-side; Redis stores ciphertext.
* Share passwords encrypt a separate share blob so a single path can be opened without master access.
* Do not use Pathpad for banking credentials, private keys, or highly sensitive material unless you accept the threat model of a single shared password and browser-side crypto.

## Note

Legacy plaintext notes are still readable and re-encrypted on the next save.
