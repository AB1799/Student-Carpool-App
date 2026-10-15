# UNT Carpool — Mobile / Backend API Contract (v1)

Base URL for local backend: `http://localhost:4000` (on a physical phone, substitute the development computer's reachable IP). JSON request/response bodies. Except registration, login, verification, and health, include header:

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

Success returns JSON with a named object (`user`, `ride`, `rides`, `booking`, etc.). Errors return `{ "error": "...", "code": "..." }`; validation may include a `details` array. All ride times are ISO 8601 **with UTC offset or Z**. Coordinates are decimal WGS84, latitude before longitude in JSON (the backend constructs PostGIS points as longitude, latitude).

## 1. Authentication (FR-01–03)

| Method & path | Body | Result |
|---|---|---|
| POST `/api/auth/register` | `{ "fullName":"Jordan Lee", "email":"jordan@my.unt.edu", "password":"password123" }` | 201; code emailed or logged to backend console in dev |
| POST `/api/auth/verify-email` | `{ "email":"jordan@my.unt.edu", "code":"123456" }` | 200, verified |
| POST `/api/auth/resend-verification` | `{ "email":"jordan@my.unt.edu" }` | Generic response; 60-second resend cooldown |
| POST `/api/auth/login` | `{ "email":"jordan@my.unt.edu", "password":"password123" }` | `token` and `user` (`id`, `emailVerified`, `role`, etc.) |

JWTs last 12 hours. **Logout in the mobile app removes its saved token** as specified by the UML. Use Expo SecureStore, not plaintext AsyncStorage, for the token. Backend does not currently provide server-side token revocation.

## 2. Account and vehicle (FR-04–05)

| Method & path | What it does |
|---|---|
| GET `/api/users/me` | Get account profile |
| PUT `/api/users/me` | Body `{ "fullName":"Jordan Lee", "photoUrl":null }` (either field optional) |
| PUT `/api/vehicles/me` | Upsert a driver's one vehicle (body below) |
| GET `/api/vehicles/me` | Get driver's saved vehicle |
| POST `/api/users/me/push-token` | Body `{ "token":"ExpoPushToken[...]" }` or `{ "token":null }` |
| GET `/api/users/me/notifications` | Up to 100 recent notifications |
| PATCH `/api/users/me/notifications/:id/read` | Mark owned notification read |

Vehicle example:

```json
{"make":"Honda","model":"Civic","modelYear":2022,"color":"Silver","licensePlate":"TX ABC1234","seatCapacity":3}
```

## 3. Ride offers and geospatial matching (FR-06–09)

### Post a ride

`POST /api/rides` (verified driver, existing vehicle required):

```json
{
  "origin": {"label":"Discovery Park", "lat":33.2533, "lng":-97.1520},
  "destination": {"label":"UNT Chilton Hall", "lat":33.2094, "lng":-97.1528},
  "departureTime":"2026-11-02T08:00:00-06:00",
  "seats":2
}
```

Returns `201 { "ride": {"id":"<uuid>","status":"OPEN","seatsTotal":2,"seatsAvailable":2,"departureTime":"..."} }`.

Other endpoints: `GET /api/rides/mine` (driver's offers), `GET /api/rides/:id` (details), `PUT /api/rides/:id` (full replacement of ride details, only until first confirmed booking), `POST /api/rides/:id/cancel` (driver cancellation), `POST /api/rides/:id/complete` (driver, once departure time has passed).

### Find a ride

`GET /api/rides/search?pickupLat=33.2533&pickupLng=-97.1520&destinationLat=33.2094&destinationLng=-97.1528&departureTime=2026-11-02T14%3A00%3A00Z&seats=1`

Optional search query params:

| Name | Default | Allowed |
|---|---|---|
| `pickupRadiusMeters` | 5000 | 100–20000 |
| `destinationRadiusMeters` | 6000 | 100–20000 |
| `timeWindowMinutes` | 60 | 5–180 |
| `seats` | 1 | 1–8 |

The backend excludes expired/cancelled rides, your own rides, requests you have already placed that are active, and rides without enough remaining seats. PostGIS filters pickup and destination proximity with `ST_DWithin`; results include `matchScore`, `pickupDistanceMeters`, `destinationDistanceMeters`, `timeDifferenceMinutes`, `driverName`, `departureTime`, and `seatsAvailable`. Scores are **provisional team choices**, not an SRS-defined formula.

**Privacy:** Vehicle license plates are not returned in general search listings. `GET /api/rides/:id` only reveals the plate to the driver or a rider with an active/completed booking.

## 4. Requests, seat safety, bookings (FR-10–13)

| Method & path | Body / behavior |
|---|---|
| POST `/api/rides/:id/requests` | `{ "passengers":1, "pickup":{"label":"Discovery Park","lat":33.2533,"lng":-97.1520} }` (`pickup` optional) |
| GET `/api/rides/:id/requests` | Driver sees ride's requests |
| GET `/api/requests/mine` | Rider sees own pending/accepted/rejected requests |
| PUT `/api/requests/:id/accept` | Driver accepts a pending request; creates one booking *atomically*; returns `{ "booking": {...} }` |
| PUT `/api/requests/:id/reject` | Driver rejects a pending request |
| GET `/api/bookings` | Rider or driver sees all confirmed/cancelled/completed bookings for My Rides |
| GET `/api/bookings/:id/messages` | Booking participant reads last 100 saved messages (oldest to newest) |

`PUT /api/requests/:id/accept` uses a PostgreSQL transaction, locks the **ride row** with `FOR UPDATE`, checks available seats, updates request status, decrements seats, inserts booking, and commits as one operation. If there are not enough seats, it returns **409 RIDE_FULL**. No manual DB updates needed.

One rider can submit only one request per ride in this MVP (DB uniqueness constraint); retrying a rejected request returns 409.

## 5. Socket.IO real-time chat (FR-14)

Install `socket.io-client` in the React Native application, connect to the same backend origin (port 4000), and authenticate via handshake:

```javascript
import { io } from 'socket.io-client';
const socket = io('http://YOUR_PC_IP:4000', {
  auth: {token: YOUR_JWT_TOKEN},
  transports: ['websocket']
});

socket.emit('chat:join', {bookingId: YOUR_BOOKING_ID}, console.log);
socket.on('chat:message', (message) => {
  // { id, bookingId, senderId, body, createdAt }
  console.log('received:', message);
});
socket.emit('chat:send', {bookingId: YOUR_BOOKING_ID, body:'I am at the front entrance.'}, console.log);
// acknowledgement: { ok:true, message } or { ok:false, error }
socket.emit('chat:leave', {bookingId: YOUR_BOOKING_ID});
```

You must **join** the booking first. The backend checks that the authenticated user is its driver or rider and the booking is CONFIRMED or COMPLETED. Chat is unavailable for pending/rejected/cancelled rides. Messages persist in PostgreSQL and are delivered to clients currently in `booking:<bookingId>` rooms. The sender's connected socket receives the event too. Limit: 20 messages per minute per socket; each message <=2000 characters.

## 6. Rating / reporting / administration (FR-16–18)

| Method & path | Body / permission |
|---|---|
| POST `/api/reviews` | `{ "bookingId":"<uuid>", "rating":5, "comment":"On time" }`; only after completion; reviewer must be booked participant |
| POST `/api/reports` | `{ "reportedUserId":"<uuid>", "reason":"At least ten characters" }` |
| GET `/api/reports` | Admin only: report queue |
| PUT `/api/reports/:id/resolve` | Admin only |
| PUT `/api/reports/users/:id/suspend` | Admin only: `{ "suspended":true }` / `false` |

There is **no public admin registration**. For a development-only admin test, manually grant the admin role to a trusted existing user in the database: `UPDATE users SET role='ADMIN' WHERE email='trusted@my.unt.edu';`. Never promote untrusted accounts.

## HTTP codes

- `200` success; `201` resource created.
- `400` malformed input / invalid verification code.
- `401` missing, invalid, or expired token.
- `403` unverified student / suspended user / not an admin.
- `404` non-existent or unauthorized ride, request, booking, report.
- `409` race-safe seat shortage, duplicate request, already processed action, or invalid ride state.
- `429` too many auth requests.
- `500` unexpected server/database error; `503` email transport unavailable during registration.

The API has no Google Maps REST calls: the **frontend's place search resolves coordinates**, and the backend's PostGIS performs spatial matching.
