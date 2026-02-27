import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err) => console.error('Redis error:', err.message));
redis.on('connect', () => console.log('✅ Redis connected'));
