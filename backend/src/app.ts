import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { requestId } from './middleware/requestId';
import { errorHandler, notFound } from './middleware/errorHandler';
import { globalRateLimiter } from './middleware/rateLimit';
import { healthRouter, type ReadinessCheck } from './modules/health/health.routes';
import { openApiSpec } from './docs/openapi';

export type AppDeps = {
  logger: Logger;
  corsOrigins: string[];
  readinessChecks: ReadinessCheck[];
  isShuttingDown?: () => boolean;
  rateLimitMax?: number;
};

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req) => (req as express.Request).id,
      // Health probes are noisy; keep them out of access logs.
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health/') },
    }),
  );
  app.use(helmet());
  // Narrow CORS: only explicitly listed origins; no wildcard.
  app.use(cors({ origin: deps.corsOrigins, credentials: false }));
  app.use(globalRateLimiter(deps.rateLimitMax));
  // Razorpay webhook (Phase 6) needs the raw body and will mount its own parser before this.
  app.use(express.json({ limit: '100kb' }));

  const v1 = express.Router();
  v1.use(healthRouter(deps.readinessChecks, deps.isShuttingDown ?? (() => false)));
  v1.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}
