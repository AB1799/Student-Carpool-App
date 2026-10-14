-- CSCE 3444 / UNT Carpool: initial relational and geospatial schema.
-- Coordinates use EPSG:4326; geography distances are in meters.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  role VARCHAR(12) NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT','ADMIN')),
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  photo_url TEXT,
  expo_push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lower_case_email CHECK (email = LOWER(email))
);

CREATE TABLE IF NOT EXISTS email_verification (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  make VARCHAR(60) NOT NULL,
  model VARCHAR(60) NOT NULL,
  model_year INTEGER CHECK (model_year BETWEEN 1980 AND 2100),
  color VARCHAR(40),
  license_plate VARCHAR(20),
  seat_capacity INTEGER NOT NULL CHECK (seat_capacity BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ride_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  origin_label VARCHAR(200) NOT NULL,
  destination_label VARCHAR(200) NOT NULL,
  origin GEOGRAPHY(POINT, 4326) NOT NULL,
  destination GEOGRAPHY(POINT, 4326) NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  seats_total INTEGER NOT NULL CHECK (seats_total BETWEEN 1 AND 8),
  seats_available INTEGER NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CANCELLED','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seats_bounds CHECK (seats_available BETWEEN 0 AND seats_total)
);
CREATE INDEX IF NOT EXISTS ride_origin_gix ON ride_offers USING GIST(origin);
CREATE INDEX IF NOT EXISTS ride_destination_gix ON ride_offers USING GIST(destination);
CREATE INDEX IF NOT EXISTS ride_active_departure_idx ON ride_offers(departure_time) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS ride_driver_idx ON ride_offers(driver_id,departure_time DESC);

CREATE TABLE IF NOT EXISTS ride_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES ride_offers(id),
  rider_id UUID NOT NULL REFERENCES users(id),
  passengers INTEGER NOT NULL CHECK (passengers BETWEEN 1 AND 8),
  pickup_label VARCHAR(200),
  pickup GEOGRAPHY(POINT, 4326),
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, rider_id)
);
CREATE INDEX IF NOT EXISTS ride_requests_ride_idx ON ride_requests(ride_id, status);
CREATE INDEX IF NOT EXISTS ride_requests_rider_idx ON ride_requests(rider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES ride_requests(id),
  ride_id UUID NOT NULL REFERENCES ride_offers(id),
  rider_id UUID NOT NULL REFERENCES users(id),
  passengers INTEGER NOT NULL CHECK (passengers BETWEEN 1 AND 8),
  status VARCHAR(12) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CANCELLED','COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bookings_rider_idx ON bookings(rider_id,created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_ride_idx ON bookings(ride_id,status);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  sender_id UUID NOT NULL REFERENCES users(id),
  body VARCHAR(2000) NOT NULL CHECK (LENGTH(TRIM(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_booking_idx ON messages(booking_id,created_at,id);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewed_id UUID NOT NULL REFERENCES users(id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, reviewer_id),
  CHECK (reviewer_id <> reviewed_id)
);
CREATE INDEX IF NOT EXISTS reviews_reviewed_idx ON reviews(reviewed_id);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  reported_id UUID NOT NULL REFERENCES users(id),
  reason VARCHAR(1000) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CHECK (reporter_id <> reported_id)
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status,created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(250) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);
