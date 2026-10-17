import 'dotenv/config';
import http from 'node:http';
import { loadEnv } from './config/env';
import { connectMongo, createRedis, disconnectMongo, pingMongo } from './config/db';
import { createLogger } from './common/logger';
import { createApp } from './app';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

  await connectMongo(env);
  const redis = createRedis(env);

  let shuttingDown = false;
  const app = createApp({
    logger,
    corsOrigins: env.CORS_ORIGINS,
    isShuttingDown: () => shuttingDown,
    readinessChecks: [
      { name: 'mongo', check: pingMongo },
      { name: 'redis', check: async () => void (await redis.ping()) },
    ],
  });

  const server = http.createServer(app);
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'server listening'));

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => {
      logger.error('forced exit after timeout');
      process.exit(1);
    }, 10_000);
    force.unref();
    server.close(async () => {
      try {
        await Promise.allSettled([disconnectMongo(), redis.quit()]);
        logger.info('shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'error during shutdown');
        process.exit(1);
      }
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
}

main().catch((err) => {
  // Logger may not exist if env validation failed.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
