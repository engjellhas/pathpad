# Private Path Notepad

A tiny personal notepad inspired by simple tools like notepad.pw.

Open any path and use it as a private note:

* `/engj`
* `/ideas`
* `/client-copy`
* `/anything`

Each path becomes a separate note. One password protects all notes. Notes autosave and can be opened from any device.

## Features

* No account system
* One simple password
* Path-based notes
* Autosave
* Vercel-ready
* Redis storage
* Clean minimal UI

## Tech Stack

* Next.js
* Vercel
* Upstash Redis

## Environment Variables

```env
NOTE_PASSWORD=your-password
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

## Run Locally

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000/engj
```

## Deploy

```bash
vercel --prod
```

## Note

This is useful for quick personal notes, drafts, links, and text sharing between devices. Do not use it for passwords, private keys, banking details, or highly sensitive information.
