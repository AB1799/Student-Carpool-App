# UNT Carpool — Backend / Database / PostGIS / Realtime Chat

**CSCE 3444, Group 1 — Backend responsibility: Himal Gautam**  
**Source of truth:** team's September 8 SRS v1.0, October 4 Sprint 1 UML document, and UNT Carpool 26-screen wireframe.

This is an **actual Node.js/Express backend source-code project**, not just a proposed architecture. It is standalone so it can be added to the team's existing repository under `backend/` without overwriting the React Native screens. It uses:

- **PostgreSQL 16 + PostGIS** for relational data and nearby-ride queries in meters.
- **REST/JSON** for authentication, vehicles, ride offers, ranked matches, requests, bookings, notifications, reviews, and reports.
- **Socket.IO** for booking-scoped, persisted real-time driver/rider chat.
- **JWT + bcrypt** for authentication; verified `@my.unt.edu` email required before posting/requesting rides.
- **Row locks + database transactions** on ride request acceptance, preventing concurrent requests from overbooking the same seats.

## Run locally (recommended: Windows with Docker Desktop)

Requirements: **Node.js 20+**, npm, Docker Desktop with Compose.

```powershell
# 1. Open a terminal in THIS backend folder.
Copy-Item .env.example .env

# 2. Open .env and replace JWT_SECRET with a UNIQUE random secret.
# PowerShell can generate one with:
# [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# 3. Start the database (first download may take a few minutes).
docker compose up -d

# 4. Install packages and initialize schema.
npm install
npm run db:migrate

# 5. Start the HTTP API and Socket.IO server.
npm run dev
```

Verify: open `http://localhost:4000/api/health`. Expected response: `{"status":"ok","database":"connected","service":"unt-carpool-backend"}`.

**Never commit `.env`**. `.env.example` holds local-demo settings only. The Docker password is intentionally a demo credential; change it for deployment.

### Run tests

```powershell
npm test                # 5 pure matching-algorithm unit tests
npm run check           # syntax validation of all JS modules
npm run smoke           # full-stack integration: needs DB + server running
```

The `smoke` script creates **three synthetic accounts**, verifies them **directly in your LOCAL database for testing**, posts a ride, performs a PostGIS search, makes two simultaneous requests for one seat, confirms only one booking succeeds, exchanges a Socket.IO chat message, completes the ride and leaves a review. It **must not be run against a production database**; it leaves demo data behind.

### Email verification during development

`.env` defaults to `EMAIL_MODE=console`: after registration, a six-digit verification code appears in the *backend terminal*, not in the API response. Send that code to `POST /api/auth/verify-email`. In production use `EMAIL_MODE=smtp` and configure `SMTP_*` variables so codes are emailed. Production startup refuses console mode.

### Connect a physical phone running Expo

The phone cannot reach the Windows host via `localhost`. In the React Native app, configure your API base URL as `http://YOUR_PC_LAN_IP:4000` when testing on the same Wi-Fi; configure the proper HTTPS server URL for deployed apps. Update `CLIENT_ORIGIN` for Expo web's actual origin if needed. The phone should use HTTPS in production.

## Main workflows delivered

1. A student creates an account, verifies their UNT email and signs in.
2. A driver saves their vehicle and posts an offer with **GPS points (latitude/longitude)**, destination, departure time, and seats.
3. A rider supplies pickup/destination coordinates and an expected departure time; PostGIS performs indexed `ST_DWithin` nearby filtering. Candidates are ranked by pickup distance, destination distance, and time difference.
4. The rider requests a seat. The **driver explicitly accepts or rejects** it (per the SRS/UML). Only acceptance creates a booking and reduces available seats.
5. Both booked participants can enter that booking's Socket.IO chat room. Every message is persisted in `messages` and can be retrieved as history.
6. A driver can complete a ride; both sides may rate the other after completion. Admins can read reports and suspend users.

### Important scope / team decisions

- **The matching score is a proposal**, not something explicitly fixed by the SRS: 50% pickup distance, 25% destination distance, 25% departure-time compatibility, with default 5 km / 6 km / 60 min windows. Update `src/lib/matching.js` after team approval.
- Matching is **point proximity**, not route-corridor/routing ETA matching. The frontend handles Google Maps/Places UI and sends the resolved coordinates here. Google Maps API keys do not belong in this backend's SQL.
- The SRS excludes payments and live trip GPS tracking. They are not implemented. Recurring rides and estimated cost share appear in the wireframe but are **not in this backend MVP**.
- Chat is enabled **only after a booking is confirmed**. Socket.IO events are authorized by user/booking membership.
- Ride cancellation marks existing bookings and requests cancelled. Individual seat-request cancellation and recovering a cancelled booking are not yet implemented.
- Push events are stored in the `notifications` table. If `EXPO_PUSH_ENABLED=true` and a user has registered a valid Expo token, the backend also attempts Expo pushes. Production push delivery and SMTP must be configured/tested with real devices/services.
- Local HTTP is for development only. Deployment requires HTTPS/TLS, secret management, secure backups, rate limits, and operational monitoring; this is **a semester-project MVP, not production-certified software**.

## Files

```text
src/
  app.js                       HTTP app and route mounts
  server.js                    HTTP + Socket.IO startup
  config.js, db.js             environment and PostgreSQL pool/transactions
  middleware/auth.js           JWT authentication and permissions
  lib/geo.js                   coordinate and input validation
  lib/matching.js              transparent ranked scoring
  routes/                      auth, users, vehicles, rides, requests, bookings,
                                reviews, reports
  services/                    email, notifications, booking authorization
  socket.js                    room-based chat auth + storage
  database/migrations/001_initial.sql  schema and GiST indexes
  database/migrate.js          create schema on initial setup
  scripts/smoke.js             end-to-end demo integration test
  tests/matching.test.js       ranking algorithm tests
  docs/API_CONTRACT.md         routes, request JSON, socket events
  docs/ARCHITECTURE.md         ER diagram, ownership, acceptance mapping
```

## What to hand to the rest of Group 1

Put this directory in the team repo as `backend/`. Send `docs/API_CONTRACT.md` to whoever is building the React Native screens. The frontend needs to provide latitude/longitude from Maps/Places, an ISO date-time with timezone (e.g. `2026-11-02T08:00:00-06:00`), and a stored JWT for secured requests. See the API contract for exact payloads.

**Test limitations:** The code was syntax-checked and its pure matching tests were executed in the artifact-generation environment. That environment does not have Docker/PostgreSQL or access to npm's registry, so the database migration, server startup, and full-stack smoke test **have not been run here**. Those steps are explicitly documented above and should be completed on the team's development machine before declaring the integration working.
