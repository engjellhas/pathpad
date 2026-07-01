import { Redis } from '@upstash/redis';

let redis: Redis | undefined;

function hasRedisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  return Boolean(url?.trim() && token?.trim());
}

export function getRedis(): Redis | null {
  if (!hasRedisEnv()) return null;

  if (!redis) {
    try {
      redis = Redis.fromEnv();
    } catch {
      return null;
    }
  }

  return redis;
}

export function storageNotConfiguredResponse() {
  return Response.json(
    {
      error:
        'Storage not configured. Add KV_REST_API_URL and KV_REST_API_TOKEN to your local .env.local (pull from Vercel or copy from dashboard).',
    },
    { status: 503 }
  );
}
