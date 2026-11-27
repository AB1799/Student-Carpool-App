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
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { auth, requireVerified } from '../middleware/auth.js';
import { asyncRoute } from '../lib/errors.js';
import * as maps from '../services/maps.js';

const router = Router();
router.use(auth, requireVerified);
router.use(rateLimit({
  windowMs: 60_000, limit: 60, keyGenerator: req => req.user.id,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: {error: 'Too many map requests. Try again in a minute.', code: 'RATE_LIMITED'},
}));

// asyncRoute (from Himal's errors.js) sends any error to the error handler,
// so we don't need try/catch in every route.

router.get('/autocomplete', asyncRoute(async (req, res) => {
  const {text} = z.object({text: z.string().trim().max(200).default('')}).parse(req.query);

  // Don't waste Google calls on 1 or 2 letters
  if (text.length < 3) {
    return res.json({ suggestions: [] });
  }

  const suggestions = await maps.autocomplete(text);
  res.json({ suggestions: suggestions });
}));

router.get('/geocode', asyncRoute(async (req, res) => {
  const {placeId,address} = z.object({
    placeId: z.string().trim().max(512).optional(),
    address: z.string().trim().max(200).optional(),
  }).parse(req.query);

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
  const coordinates = z.object({
    lat: z.string().trim().min(1).pipe(z.coerce.number().min(-90).max(90)),
    lng: z.string().trim().min(1).pipe(z.coerce.number().min(-180).max(180)),
  });
  const {lat,lng} = coordinates.parse(req.query);

  const location = await maps.reverseGeocode(lat, lng);
  if (!location) {
    return res.status(404).json({ error: 'No address found for that spot', code: 'NOT_FOUND' });
  }
  res.json({ location: location });
}));

export default router;
