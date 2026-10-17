# Staging plan and observability baseline

## Environments
| Env | Purpose | Providers |
|---|---|---|
| local | Developer machine; `infra/docker-compose.yml` | mocks |
| staging | Shared URL for app/admin developers and QA (Day-2 target) | provider **test mode** (Razorpay test, Maps key with quota) |
| production | Pilot and later | live only; `PROVIDER_MODE=mock` is rejected at boot |

**Hosting is undecided** (question to lead). Requirements: Node 20 runtime, managed MongoDB replica set (e.g. Atlas),
managed Redis, HTTPS, secret store, log shipping. Staging is deployed in Phase 3.5; Phase 0 only provides the
CI pipeline (`.github/workflows/ci.yml`) and the health endpoints a platform needs.

## Deployment checklist (to be filled when hosting is chosen)
- Build: `npm ci && npm run build`; start: `npm start`.
- Liveness probe: `GET /api/v1/health/live`; readiness probe: `GET /api/v1/health/ready`.
- SIGTERM triggers graceful shutdown: readiness turns 503, server stops accepting, connections close (10 s hard cap).
- Secrets from the platform secret store, never from Git.

## Observability baseline (Phase 0)
- Structured JSON logs (pino) with `requestId` on every line; request logging via pino-http (health probes excluded).
- Redaction: authorization header, cookies, passwords, OTPs, tokens, payment signatures.
- `X-Request-Id` on every response; the same id appears in error envelopes.

## Deferred to Phase 8 (listed so they are not forgotten)
Metrics (latency, dispatch timeouts, GPS staleness, payment failures, webhook lag, queue depth), error tracking
(e.g. Sentry), alerting, log shipping, backups and restore drill.
