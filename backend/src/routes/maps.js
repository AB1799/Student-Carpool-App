// Maps routes (Jared). All of these start with /api/maps
//
//   GET /api/maps/autocomplete?text=disc        suggestions while typing
//   GET /api/maps/geocode?placeId=...            a picked suggestion -> lat/lng
//   GET /api/maps/geocode?address=...            typed address -> lat/lng
//   GET /api/maps/reverse?lat=33.21&lng=-97.15   lat/lng -> address ("use my location")
//
// How the app uses this when posting or searching for a ride:
//   1. User types "disc"     -> call autocomplete, show the suggestions
//   2. User taps one         -> call geocode with its placeId
//   3. Use the label/lat/lng that comes back as origin, destination, or pickup
//      in the normal ride routes.

import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { asyncRoute } from '../lib/errors.js';
import * as maps from '../services/maps.js';

const router = Router();
router.use(auth); // must be logged in

// asyncRoute (from Himal's errors.js) sends any error to the error handler,
// so we don't need try/catch in every route.

router.get('/autocomplete', asyncRoute(async (req, res) => {
  const text = (req.query.text || '').trim();

  // Don't waste Google calls on 1 or 2 letters
  if (text.length < 3) {
    return res.json({ suggestions: [] });
  }

  const suggestions = await maps.autocomplete(text);
  res.json({ suggestions: suggestions });
}));

router.get('/geocode', asyncRoute(async (req, res) => {
  const placeId = (req.query.placeId || '').trim();
  const address = (req.query.address || '').trim();

  let location = null;
  if (placeId) {
    location = await maps.geocodePlaceId(placeId);
  } else if (address) {
    location = await maps.geocodeAddress(address);
  } else {
    return res.status(400).json({ error: 'Send a placeId or an address', code: 'VALIDATION_ERROR' });
  }

  if (!location) {
    return res.status(404).json({ error: 'Could not find that place', code: 'NOT_FOUND' });
  }
  res.json({ location: location });
}));

router.get('/reverse', asyncRoute(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  // Number('') is 0, so also make sure something was actually sent
  const latOk = req.query.lat && Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const lngOk = req.query.lng && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  if (!latOk || !lngOk) {
    return res.status(400).json({ error: 'lat and lng must be valid numbers', code: 'VALIDATION_ERROR' });
  }

  const location = await maps.reverseGeocode(lat, lng);
  if (!location) {
    return res.status(404).json({ error: 'No address found for that spot', code: 'NOT_FOUND' });
  }
  res.json({ location: location });
}));

export default router;
