
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import type { Env } from './env';


// MongoDB Atlas SRV DNS resolution fix (querySrv ECONNREFUSED bypass)


export async function connectMongo(env: Env): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

/**
 * Connection settings, kept in one pure function so they are testable.
 *  - Writes wait for a majority of replicas and the journal, so an acknowledged booking, assignment
 *    or (later) payment survives a primary failover. This does not depend on the URI.
 *  - Reads stay on the primary at the default read concern: every decision here is a conditional
 *    update on the primary, and a stale secondary read could let two drivers both look eligible.
 *  - Indexes are NOT built automatically in production: building one on a large live collection
 *    slows the app, and a unique index fails if duplicates exist. Run `npm run indexes` as a release
 *    step instead (see src/db/ensureIndexes.ts).
 */
export function mongoOptions(env: Pick<Env, 'NODE_ENV' | 'MONGO_MAX_POOL_SIZE'>) {
  return {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    retryWrites: true,
    w: 'majority' as const,
    journal: true,
    autoIndex: env.NODE_ENV !== 'production',
  };
}

export async function connectMongo(env: Env): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(env.MONGODB_URI, mongoOptions(env));
>>>>>>> origin/feature/development
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export async function pingMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('mongo not connected');
  }
  await mongoose.connection.db.admin().ping();
}

<<<<<<< HEAD
export function createRedis(env: Env): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
  });
}
=======
export function createRedis(env: Env): Redis | null {
  if (!env.REDIS_URL) return null;
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
}
>>>>>>> origin/feature/development
