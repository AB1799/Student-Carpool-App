// My Rides screen (Jared) - FR-13
//
//   GET /api/my-rides
//
// Returns every ride I am part of, as a driver OR as a rider, split into:
//   upcoming - rides that are still open
//   history  - rides that were completed or cancelled
//
// Each ride has role: 'DRIVER' or 'RIDER' so the app can show the right label.

import { Router } from 'express';
import { db } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncRoute } from '../lib/errors.js';

const router = Router();
router.use(auth); // must be logged in

router.get('/', asyncRoute(async (req, res) => {
  const myId = req.user.id;

  // 1. Rides I posted as the driver
  const driving = await db(
    `SELECT r.id AS "rideId",
            'DRIVER' AS role,
            r.origin_label AS "originLabel",
            r.destination_label AS "destinationLabel",
            r.departure_time AS "departureTime",
            r.seats_total AS "seatsTotal",
            r.seats_available AS "seatsAvailable",
            r.status AS "rideStatus"
     FROM ride_offers r
     WHERE r.driver_id = $1`,
    [myId]
  );

  // 2. Rides I have a booking on as the rider
  const riding = await db(
    `SELECT r.id AS "rideId",
            'RIDER' AS role,
            r.origin_label AS "originLabel",
            r.destination_label AS "destinationLabel",
            r.departure_time AS "departureTime",
            r.status AS "rideStatus",
            b.id AS "bookingId",
            b.passengers,
            b.status AS "bookingStatus",
            driver.full_name AS "driverName"
     FROM bookings b
     JOIN ride_offers r ON r.id = b.ride_id
     JOIN users driver ON driver.id = r.driver_id
     WHERE b.rider_id = $1`,
    [myId]
  );

  // Put both lists together
  const allRides = driving.rows.concat(riding.rows);

  // Split them up. A ride is "upcoming" while it is still OPEN.
  // (If a rider's booking was cancelled, the ride goes to history for them.)
  const upcoming = [];
  const history = [];
  for (const ride of allRides) {
    const stillOpen = ride.rideStatus === 'OPEN' && ride.bookingStatus !== 'CANCELLED';
    if (stillOpen) {
      upcoming.push(ride);
    } else {
      history.push(ride);
    }
  }

  // Upcoming: soonest first. History: most recent first.
  upcoming.sort((a, b) => a.departureTime - b.departureTime);
  history.sort((a, b) => b.departureTime - a.departureTime);

  res.json({ upcoming: upcoming, history: history });
}));

export default router;
