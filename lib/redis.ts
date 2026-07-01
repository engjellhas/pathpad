import { Redis } from '@upstash/redis';

let redis: Redis | null | undefined;

function redisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token || !url.startsWith('https://')) {
    return null;
  }

  return { url, token };
}

export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const env = redisEnv();
  if (!env) {
    redis = null;
    return redis;
  }

  redis = new Redis(env);
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
