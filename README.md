# Cab Booking Platform

Uber/Ola-style cab booking platform.

| Folder | Purpose |
|---|---|
| `backend/` | Node.js + Express + TypeScript API (modular monolith) |
| `customer-app/` | React Native customer app (placeholder) |
| `driver-app/` | React Native driver app (placeholder) |
| `admin-panel/` | Next.js admin panel (placeholder) |
| `docs/` | Specs, decisions, API contract, enums |
| `postman/` | Postman collection + environment template |
| `infra/` | Local dev infrastructure (Docker Compose) |

Project status and phase checklist: see [CONTEXT.md](CONTEXT.md).

## Backend quick start

Requires Node 20+, MongoDB (replica set) and Redis.

```bash
# 1. Start MongoDB + Redis (needs Docker), or point .env at Atlas / hosted Redis
docker compose -f infra/docker-compose.yml up -d

# 2. Configure
cd backend
cp .env.example .env     # then edit secrets

# 3. Run
npm install
npm run dev              # http://localhost:4000/api/v1/health/ready
```

Scripts: `npm run lint | typecheck | build | test | format:check`.
OpenAPI spec: `GET /api/v1/openapi.json`.
