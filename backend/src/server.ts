import 'dotenv/config';
import http from 'node:http';
import { loadEnv } from './config/env';
import { connectMongo, createRedis, disconnectMongo, pingMongo } from './config/db';
import { createLogger } from './common/logger';
import { createApp } from './app';
import { createProviders } from './providers';
import { authConfigFromEnv } from './modules/auth/auth.config';
import { startDispatchSweeper } from './jobs/dispatchSweeper';
import type { DispatchService } from './modules/dispatch/dispatch.service';
import type { DocumentExpiryService } from './modules/drivers/documentExpiry.service';
import type { NotificationsService } from './modules/notifications/notifications.service';
import type { PresenceService } from './modules/presence/presence.service';
import { createSocketBus } from './realtime/socketServer';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');

  await connectMongo(env);
  const redis = createRedis(env);

  let shuttingDown = false;
  const sockets = createSocketBus();
  const providers = createProviders(env, {
    // Dev convenience only: lets you log in without an SMS provider. Never runs in production.
    onOtp:
      env.NODE_ENV === 'development'
        ? (phone, otp) => logger.info({ phone, devOtpCode: otp }, 'DEV OTP')
        : undefined,
  });
  const app = createApp({
    logger,
    providers,
    authConfig: authConfigFromEnv(env),
    corsOrigins: env.CORS_ORIGINS,
    realtimeBus: sockets.bus,
    // SOS stays off in production until a staffed response process exists; staff can switch it on.
    featureDefaults: { SOS: env.NODE_ENV !== 'production' },
    tripLinkBase: env.TRIP_LINK_BASE?.replace(/\/$/, ''),
    alertWebhookUrl: env.ALERT_WEBHOOK_URL,
    metricsToken: env.METRICS_TOKEN,
    environmentName: env.NODE_ENV,
    // "Pretend the rider paid" for app developers, only with mock payments and never in production.
    devPayments: env.NODE_ENV !== 'production' && env.PAYMENTS_DRIVER === 'mock',
    isShuttingDown: () => shuttingDown,
    readinessChecks: [
      { name: 'mongo', check: pingMongo },
      ...(redis ? [{ name: 'redis', check: async () => void (await redis.ping()) }] : []),
    ],
  });

  // Offer expiry and re-dispatch. DB-driven so it needs no Redis; safe to run on every instance.
  const services = app.locals['services'] as {
    dispatch: DispatchService;
    presence: PresenceService;
    notifications: NotificationsService;
    documentExpiry: DocumentExpiryService;
    finance: { run: () => Promise<unknown> };
    safety: { escalate: () => Promise<unknown> };
    monitor: {
      run: () => Promise<unknown>;
      recordJob: (name: string, intervalMs: number, ok: boolean) => void;
    };
    housekeeping: { run: () => Promise<unknown> };
  };
  const sweeper = startDispatchSweeper(
    services.dispatch,
    logger,
    {},
    services.notifications,
    services.documentExpiry,
    services.finance,
    [
      // An SOS nobody has picked up is raised again to a super admin.
      { name: 'safety escalation', ms: 30_000, run: () => services.safety.escalate() },
      { name: 'housekeeping', ms: 60_000, run: () => services.housekeeping.run() },
      // Looks for trouble that needs a person (money, stuck searches, unanswered SOS, dead jobs).
      { name: 'monitor', ms: 60_000, run: () => services.monitor.run() },
    ],
    (name, ms, ok) => services.monitor.recordJob(name, ms, ok),
  );

  const server = http.createServer(app);
  // Slow or stalled clients must not hold connections open forever.
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000; // longer than a typical load balancer's idle timeout
  // Live updates ride on the same port and the same login as the REST API.
  sockets.attach(server, {
    accessSecret: env.JWT_ACCESS_SECRET,
    logger,
    presence: services.presence,
    corsOrigins: env.CORS_ORIGINS,
  });
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'server listening'));

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    sweeper.stop();
    logger.info({ signal }, 'shutting down');
    await sockets.close();
    const force = setTimeout(() => {
      logger.error('forced exit after timeout');
      process.exit(1);
    }, 10_000);
    force.unref();
    server.close(async () => {
      try {
        await Promise.allSettled([disconnectMongo(), redis?.quit()]);
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
