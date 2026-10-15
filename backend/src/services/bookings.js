import {db} from '../db.js';
import {HttpError} from '../lib/errors.js';
export async function getAccessibleBooking(bookingId,userId) {
  const {rows}=await db(`SELECT b.*,r.driver_id, r.departure_time, r.origin_label,r.destination_label
    FROM bookings b JOIN ride_offers r ON r.id=b.ride_id WHERE b.id=$1`,[bookingId]);
  const b=rows[0];
  if(!b || (b.rider_id!==userId && b.driver_id!==userId)) throw new HttpError(404,'Booking not found','NOT_FOUND');
  return b;
}
