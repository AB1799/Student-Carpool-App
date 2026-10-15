// Google Maps helper functions (Jared)
//
// The app asks OUR backend for map info, and the backend asks Google.
// That way the Google API key stays on the server and never goes in the app.
//
// Two Google APIs are used. Both must be turned on for the key in Google Cloud:
//   - Geocoding API     : turns an address or place into latitude/longitude
//   - Places API (New)  : gives suggestions while the user is typing

import { HttpError } from '../lib/errors.js';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

// Middle of the UNT campus, so places near Denton show up first
const UNT_LAT = 33.2107;
const UNT_LNG = -97.1503;

function getApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new HttpError(500, 'GOOGLE_MAPS_API_KEY is missing from the .env file', 'MAPS_NOT_SET_UP');
  }
  return key;
}

// Asks the Geocoding API a question and returns the best answer.
// Returns { label, lat, lng }, or null if Google found nothing.
async function askGeocodingApi(searchParams) {
  searchParams.set('key', getApiKey());

  const response = await fetch(GEOCODE_URL + '?' + searchParams.toString());
  const data = await response.json();

  if (data.status === 'ZERO_RESULTS') {
    return null;
  }
  if (data.status !== 'OK') {
    // For example REQUEST_DENIED (bad key) or OVER_QUERY_LIMIT (free tier used up)
    console.error('Google Geocoding error:', data.status, data.error_message);
    throw new HttpError(502, 'Google Maps request failed', 'MAPS_ERROR');
  }

  const best = data.results[0];
  return {
    label: best.formatted_address,
    lat: best.geometry.location.lat,
    lng: best.geometry.location.lng,
  };
}

// "1155 Union Circle, Denton" -> { label, lat, lng }
export function geocodeAddress(address) {
  const params = new URLSearchParams();
  params.set('address', address);
  params.set('region', 'us');
  return askGeocodingApi(params);
}

// A place id from autocomplete -> { label, lat, lng }
export function geocodePlaceId(placeId) {
  const params = new URLSearchParams();
  params.set('place_id', placeId);
  return askGeocodingApi(params);
}

// 33.21, -97.15 -> { label, lat, lng }
export function reverseGeocode(lat, lng) {
  const params = new URLSearchParams();
  params.set('latlng', lat + ',' + lng);
  return askGeocodingApi(params);
}

// Suggestions for what the user has typed so far.
// Returns a list like [{ placeId, description }]
export async function autocomplete(text) {
  const response = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': getApiKey(),
    },
    body: JSON.stringify({
      input: text,
      includedRegionCodes: ['us'],
      // Prefer places within about 30 km of campus
      locationBias: {
        circle: {
          center: { latitude: UNT_LAT, longitude: UNT_LNG },
          radius: 30000,
        },
      },
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    console.error('Google Autocomplete error:', data.error);
    throw new HttpError(502, 'Google Maps request failed', 'MAPS_ERROR');
  }

  const results = [];
  const suggestions = data.suggestions || [];
  for (const suggestion of suggestions) {
    if (suggestion.placePrediction) {
      results.push({
        placeId: suggestion.placePrediction.placeId,
        description: suggestion.placePrediction.text.text,
      });
    }
  }
  return results;
}
