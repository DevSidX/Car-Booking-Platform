import dns from 'dns';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import type { Env } from './env';

// MongoDB Atlas SRV DNS resolution fix (querySrv ECONNREFUSED bypass)
dns.setServers(['8.8.8.8', '1.1.1.1']);

export async function connectMongo(env: Env): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
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

export function createRedis(env: Env): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
  });
}