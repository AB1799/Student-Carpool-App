import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type User = { id: string; email: string; fullName: string; emailVerified: boolean; role?: 'STUDENT' | 'ADMIN'; photoUrl?: string | null };
export type Location = { label: string; lat: number; lng: number };
export type Vehicle = { make: string; model: string; modelYear?: number | null; color?: string | null; licensePlate?: string | null; seatCapacity: number };
export type Ride = {
  id: string; riderId?: string; riderName?: string; driverId?: string; driverName?: string; driverRating?: number | string | null;
  originLabel: string; destinationLabel: string; originLat?: number; originLng?: number;
  destinationLat?: number; destinationLng?: number; departureTime: string;
  seatsAvailable?: number; seatsTotal?: number; passengers?: number; status: string;
  vehicleMake?: string; vehicleModel?: string; vehicleColor?: string; matchScore?: number;
  pickupDistanceMeters?: number; rideId?: string; bookingId?: string; requestId?: string;
  driving?: boolean; licensePlate?: string | null;
};
export type SeatRequest = { id: string; riderName: string; passengers: number; pickupLabel?: string; status: string };
export type Notice = { id: string; title: string; body: string; createdAt: string; readAt: string | null };

export const apiOrigin = process.env.EXPO_PUBLIC_SAME_ORIGIN === 'true' && Platform.OS === 'web'
  ? globalThis.location.origin
  : (process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000')).replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

export async function api<T>(path: string, token?: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiOrigin + '/api' + path, {
      method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach UNT Carpool. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.details?.[0];
    throw new ApiError(detail ? [detail.path, detail.message].filter(Boolean).join(' · ') : data.error ?? 'The request failed. Please try again.', response.status, data.code);
  }
  return data as T;
}

const key = 'unt-carpool-session';
export const session = {
  read: () => Platform.OS === 'web' ? Promise.resolve(globalThis.sessionStorage.getItem(key)) : SecureStore.getItemAsync(key),
  save: (token: string) => Platform.OS === 'web' ? Promise.resolve(globalThis.sessionStorage.setItem(key, token)) : SecureStore.setItemAsync(key, token),
  clear: () => Platform.OS === 'web' ? Promise.resolve(globalThis.sessionStorage.removeItem(key)) : SecureStore.deleteItemAsync(key),
};

export const campus: Location[] = [
  { label: 'Discovery Park', lat: 33.2533, lng: -97.152 },
  { label: 'UNT Chilton Hall', lat: 33.2094, lng: -97.1528 },
  { label: 'UNT University Union', lat: 33.2101, lng: -97.1478 },
];
export const query = (values: Record<string, string | number>) => new URLSearchParams(
  Object.entries(values).map(([key, value]) => [key, String(value)]),
).toString();
