# Maps, Ratings, and My Rides (Jared)

These routes are added on top of Himal's backend. They all need the
`Authorization: Bearer <token>` header like the other routes.

## Setup

Add this line to your `.env` file:

```
GOOGLE_MAPS_API_KEY=your-key-here
```

In Google Cloud, turn on **Geocoding API** and **Places API (New)** for that key.
Only the Maps routes need the key. Everything else works without it.

## Maps

| Route | What it does |
|---|---|
| GET `/api/maps/autocomplete?text=disc` | Suggestions while typing (needs 3+ letters) |
| GET `/api/maps/geocode?placeId=...` | A picked suggestion to `{ label, lat, lng }` |
| GET `/api/maps/geocode?address=...` | A typed address to `{ label, lat, lng }` |
| GET `/api/maps/reverse?lat=33.21&lng=-97.15` | Coordinates to an address ("use my location") |

How the app uses it on the Post a Ride / Find a Ride screens:

1. User types "disc" -> call `autocomplete`, show the list
2. User taps a suggestion -> call `geocode` with its `placeId`
3. Send the `location` that comes back as `origin`, `destination`, or `pickup`
   to the normal ride routes. It is already in the `{ label, lat, lng }` shape they expect.

Example reply from `geocode`:

```json
{ "location": { "label": "Discovery Park, 3940 N Elm St, Denton, TX", "lat": 33.2533, "lng": -97.152 } }
```

## Ratings (FR-16)

| Route | What it does |
|---|---|
| GET `/api/ratings/:userId` | Someone's average rating, number of reviews, and the reviews |

```json
{
  "userId": "...",
  "fullName": "John Driver",
  "averageRating": 4.5,
  "reviewCount": 2,
  "reviews": [
    { "rating": 5, "comment": "Great ride", "createdAt": "...", "reviewerName": "Maria Rider" }
  ]
}
```

`averageRating` is `null` when nobody has reviewed the user yet.
Leaving a review is still Himal's `POST /api/reviews`.

## My Rides (FR-13)

| Route | What it does |
|---|---|
| GET `/api/my-rides` | Every ride I'm in, as driver or rider, split into `upcoming` and `history` |

- `upcoming`: rides that are still open, soonest first
- `history`: completed or cancelled rides, newest first
- each ride has `role`: `DRIVER` or `RIDER`
- rider rides also have `bookingId` (needed to leave a review) and `driverName`
- a request that hasn't been accepted yet is not a booked ride, so it doesn't show here
  (Himal's `GET /api/requests/mine` lists those)
