import { Redis } from '@upstash/redis';

let redis: Redis | null | undefined;

function createRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (url && token && url.startsWith('https://')) {
    return new Redis({ url, token });
  }

  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  redis = createRedis();
  return redis;
}

export function storageNotConfiguredResponse() {
  return Response.json(
    {
      error:
        'Storage not configured. In Vercel, open your project → Storage → Upstash Redis → Create.',
    },
    { status: 503 }
  );
}
