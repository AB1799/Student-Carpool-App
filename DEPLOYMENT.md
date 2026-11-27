# UNT Carpool web deployment

The repository includes an Expo frontend, an Express and Socket.IO API, and PostgreSQL migrations. Use an isolated database, hostname, JWT secret, and SMTP sender for staging. For a public deployment, use a separate database and credentials.

## Inputs

- A server with Docker Compose and ports 80 and 443 reachable
- A DNS hostname pointing to that server
- A private PostgreSQL database with the PostGIS and pgcrypto extensions available
- An SMTP sender approved by your mail provider and a UNT test inbox
- An optional server-side Google Maps key with Geocoding and Places API (New)

Copy `.env.deploy.example` to `.env.deploy`, set the hostname and matching HTTPS origin, and enter the credentials. Use the public hostname without the scheme in `PUBLIC_SITE_ADDRESS`. Generate a unique `JWT_SECRET` with `openssl rand -hex 32`. Keep the filled file outside version control and limit read access.

From the repository root:

```sh
docker compose --env-file .env.deploy -f compose.deploy.yml up -d --build
docker compose --env-file .env.deploy -f compose.deploy.yml ps
```

The migration job applies the schema before the API starts. The Caddy container serves the Expo export and proxies the API and Socket.IO on the same HTTPS origin. Keep the API port private when using the configured one-hop proxy trust setting. Caddy stores its TLS state in a named volume. Back up the database before applying changes to an existing environment.

## Staging acceptance

1. Check that the staging website loads and `/api/health` reports a connected database.
2. Register two verified test users. Check email delivery, resend, an incorrect code and an expired code.
3. Request a password reset, reuse the code to verify it is rejected, and check that the previous password and authenticated sessions are invalid.
4. Post a ride, request a seat, accept from the driver account and verify the rider sees a confirmed booking. Repeat with two riders competing for the last seat.
5. Open chat on both accounts, send a message, refresh to check history, and submit a test report. Check that staff can resolve the report through the Moderation screen with a trusted staff account.
6. With Maps configured, verify autocomplete and geocoding. Verify web layouts on phone and desktop, and use a physical phone for any native release.
7. Configure host and database alerts, test backups by restoring into a separate database, and review the privacy copy and support contact before opening registration.

For an alternative static host, run `npx expo export --platform web` in `frontend` with `EXPO_PUBLIC_API_URL` set to the public API URL and `EXPO_PUBLIC_ENABLE_DEMO=false`. Serve `frontend/dist`, and allow that website origin in the API's `CLIENT_ORIGIN`.

## Scope

The web build provides in-app notifications. Native push registration and delivery need a native build and Expo push credentials. Recurring rides create individual offers for selected weekdays over the four weeks after the first departure. Drivers edit and cancel each date individually.

## Render Static Site preview

The root `render.yaml` provisions one Static Site. It builds from `frontend`, publishes `dist`, and enables the sample-data experience. To publish it, link the branch containing this file through Render Blueprints. The Blueprint disables automatic deployments.

To connect it to a live backend later, set `EXPO_PUBLIC_DEMO_ONLY=false` in the Blueprint and set `EXPO_PUBLIC_API_URL` to the hosted API origin in Render. Add the static site's HTTPS origin to the backend's `CLIENT_ORIGIN` and rebuild the static site.

## Live website on free tiers

Create a Neon Free project with PostgreSQL and copy its direct TLS connection string for `DATABASE_URL`. Create a Brevo Free account, verify a sender, and generate an email API key. The application sends signup and reset messages over HTTPS.

Deploy the `render.live.yaml` Blueprint from Render. It creates a single Free web service and reads the Neon URL, website origin, and Brevo values from Render's environment. The service applies migrations when it starts. Set `CLIENT_ORIGIN` to the exact HTTPS origin of the static website. Do not put the database or mail credentials in Git or Expo environment variables.

After the API health check passes, use the existing Static Site's Environment page to set `EXPO_PUBLIC_DEMO_ONLY=false`, `EXPO_PUBLIC_ENABLE_DEMO=false`, and `EXPO_PUBLIC_API_URL` to the API's HTTPS origin. Redeploy the static site. The demo Blueprint sets its original defaults at sync, so avoid resyncing that Blueprint unless those defaults have been updated. Verify signup with a real UNT mailbox before sharing it widely. Free Render services may need time to wake on the first request.
