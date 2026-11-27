# UNT Carpool frontend

React Native and Expo app for the CSCE 3444 project, covering student authentication, profiles, and driver and rider screens.

## Run from this directory

```bash
npm ci
npm run web
```

Open the address Expo prints. Choose **Explore the demo** to use sample data in the browser or on a phone. Demo changes reset when you exit.

For a phone or simulator, run `npm start`. Use a client compatible with the Expo SDK in `package.json`.

## Connect the real backend

Start the existing sibling `backend/` with PostgreSQL and PostGIS, apply its migration, then start its Express server. The frontend uses port 4000 by default. For a physical device, set `EXPO_PUBLIC_API_URL` in `.env.local` to the development computer’s LAN address, such as `http://192.168.1.10:4000`, and restart Expo. For web, the backend’s `CLIENT_ORIGIN` must allow the browser’s exact origin. In console email mode, retrieve your verification code from the backend terminal.

The app uses the available driver-offer, rider-request, and booking endpoints to assemble My Rides. Requests remain pending until accepted. For pickups and destinations, campus shortcuts, GPS, and manual coordinates work without the maps routes. The mounted Maps routes require a Google Maps key in the backend environment. Aggregate ratings use the mounted ratings endpoint. Favorites and the preferred role are stored on the device. Native session tokens use Expo SecureStore. Web session tokens use session storage.

Ride offers can repeat on selected weekdays over the four weeks after the first departure. Each date can be edited or cancelled individually. Password recovery, booking chat, rider cancellation, and staff moderation use the real backend. The web build displays in-app notifications. Native push registration is pending.

## Check

```bash
npm run check
npx expo install --check
npx expo export --platform web
```
