

- **PostgreSQL 16 + PostGIS** for relational data and nearby-ride queries in meters.
- **REST/JSON** for authentication, vehicles, ride offers, ranked matches, requests, bookings, notifications, reviews, and reports.
- **Socket.IO** for booking-scoped, persisted real-time driver/rider chat.
- **JWT + bcrypt** for authentication; verified `@my.unt.edu` email required before posting/requesting rides.
- **Row locks + database transactions** on ride request acceptance, preventing concurrent requests from overbooking the same seats.



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


