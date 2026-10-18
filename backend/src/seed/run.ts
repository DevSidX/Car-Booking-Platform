import 'dotenv/config';
import { connectMongo, disconnectMongo } from '../config/db';
import { loadEnv } from '../config/env';
import { seedAll } from './seed';

async function main(): Promise<void> {
  const env = loadEnv();
  await connectMongo(env);
  const result = await seedAll({ adminPhone: process.env['SEED_ADMIN_PHONE'] });
  console.log('Seed complete:', result);
  await disconnectMongo();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
