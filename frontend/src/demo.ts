import { campus, type Notice, type Ride, type SeatRequest, type User, type Vehicle } from './api';

const departure = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(8, 0, 0, 0);
  return date.toISOString();
};
const example: Ride = {
  id: 'john-ride', driverId: 'john', driverName: 'John Lee', driverRating: 4.9,
  originLabel: campus[0].label, originLat: campus[0].lat, originLng: campus[0].lng,
  destinationLabel: campus[1].label, destinationLat: campus[1].lat, destinationLng: campus[1].lng,
  departureTime: departure(1), seatsAvailable: 2, seatsTotal: 3, status: 'OPEN',
  vehicleMake: 'Honda', vehicleModel: 'Civic', vehicleColor: 'Silver', matchScore: 96,
};
export const demoUser: User = {id: 'sam', fullName: 'Sam Taylor', email: 'sam@my.unt.edu', emailVerified: true};
export function makeDemo() {
  let user = {...demoUser};
  let vehicle: Vehicle = {make: 'Honda', model: 'Civic', color: 'Silver', seatCapacity: 3};
  let rides = [{...example, id: 'sam-ride', driverId: user.id, driverName: user.fullName, departureTime: departure(3)}];
  let requests: Ride[] = [];
  let bookings = [{...example, id: 'demo-booking', rideId: example.id, status: 'CONFIRMED', passengers: 1}];
  const incoming: SeatRequest[] = [{id: 'incoming', riderName: 'Maria Ruiz', passengers: 1, pickupLabel: campus[0].label, status: 'PENDING'}];
  const matches = [{...example, id: 'maria-ride', driverId: 'maria', driverName: 'Maria Ruiz', driverRating: 4.8, departureTime: departure(2), matchScore: 90}];
  const notices: Notice[] = [{id: '1', title: 'John confirmed your ride', body: 'Your seat to UNT Chilton Hall is confirmed.', createdAt: new Date().toISOString(), readAt: null}];
  return async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const send = (data: unknown) => data as T;
    const values = body as Record<string, unknown>;
    if (path === '/users/me') {
      if (method === 'PUT') user = {...user, ...values};
      return send({user});
    }
    if (path === '/vehicles/me') {
      if (method === 'PUT') vehicle = body as Vehicle;
      return send({vehicle});
    }
    if (path === '/rides/mine') return send({rides});
    if (path === '/bookings') return send({bookings});
    if (path === '/requests/mine') return send({requests});
    if (path === '/users/me/notifications') return send({notifications: notices});
    if (path.endsWith('/read')) {
      const notice = notices.find(item => item.id === path.split('/')[4]);
      if (notice) notice.readAt = new Date().toISOString();
      return send({});
    }
    if (path.startsWith('/rides/search?')) {
      const params = new URLSearchParams(path.split('?')[1]);
      const time = Date.parse(params.get('departureTime') ?? '');
      const windowMs = Number(params.get('timeWindowMinutes')) * 60000;
      const seats = Number(params.get('seats'));
      const nearby = (lat?: number, lng?: number, prefix = 'pickup') =>
        lat != null && lng != null && Math.hypot(lat - Number(params.get(prefix + 'Lat')), lng - Number(params.get(prefix + 'Lng'))) < 0.05;
      return send({rides: matches.filter(match => match.status === 'OPEN' && (match.seatsAvailable ?? 0) >= seats &&
        Math.abs(Date.parse(match.departureTime) - time) <= windowMs &&
        nearby(match.originLat, match.originLng) && nearby(match.destinationLat, match.destinationLng, 'destination') &&
        !requests.some(request => request.rideId === match.id))});
    }
    if (path.startsWith('/maps/autocomplete')) return send({suggestions: []});
    if (path === '/rides' && method === 'POST') {
      const {origin, destination, departureTime, seats} = body as {origin: typeof campus[number]; destination: typeof campus[number]; departureTime: string; seats: number};
      const ride = {...example, id: 'ride-' + Date.now(), driverId: user.id, driverName: user.fullName, departureTime,
        originLabel: origin.label, originLat: origin.lat, originLng: origin.lng,
        destinationLabel: destination.label, destinationLat: destination.lat, destinationLng: destination.lng,
        seatsAvailable: seats, seatsTotal: seats};
      rides = [...rides, ride];
      return send({ride});
    }
    if (path.startsWith('/requests/')) {
      const request = incoming.find(item => item.id === path.split('/')[2]);
      if (request?.status !== 'PENDING') throw new Error('This request is no longer pending.');
      const accepted = path.endsWith('/accept');
      request.status = accepted ? 'ACCEPTED' : 'REJECTED';
      if (accepted) {
        const ride = rides.find(item => item.id === 'sam-ride')!;
        ride.seatsAvailable = Math.max(0, (ride.seatsAvailable ?? 0) - request.passengers);
        bookings = [...bookings, {...ride, id: 'maria-booking', rideId: ride.id, status: 'CONFIRMED', passengers: request.passengers}];
      }
      return send({});
    }
    const [, , id, action] = path.split('/');
    const ride = [...rides, example, ...matches].find(item => item.id === id);
    if (ride) {
      if (action === 'requests' && method === 'GET') return send({requests: id === 'sam-ride' ? incoming : []});
      if (action === 'requests') {
        const request = {...ride, id: 'request-' + Date.now(), rideId: id, status: 'PENDING', passengers: Number(values.passengers)};
        requests = [...requests, request];
        return send({request});
      }
      if (action === 'cancel' || action === 'complete') {
        ride.status = action === 'cancel' ? 'CANCELLED' : 'COMPLETED';
        bookings = bookings.map(item => item.rideId === id ? {...item, status: ride.status} : item);
      }
      if (method === 'PUT') {
        const {origin, destination, departureTime, seats} = body as {origin: typeof campus[number]; destination: typeof campus[number]; departureTime: string; seats: number};
        Object.assign(ride, {originLabel: origin.label, originLat: origin.lat, originLng: origin.lng, destinationLabel: destination.label,
          destinationLat: destination.lat, destinationLng: destination.lng, departureTime, seatsTotal: seats, seatsAvailable: seats});
      }
      return send({ride});
    }
    if (path === '/reviews') return send({});
    throw new Error('This action needs the live backend.');
  };
}
