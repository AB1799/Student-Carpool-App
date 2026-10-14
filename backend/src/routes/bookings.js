import {Router} from 'express';
import {z} from 'zod';
import {db} from '../db.js';
import {auth} from '../middleware/auth.js';
import {asyncRoute} from '../lib/errors.js';
import {getAccessibleBooking} from '../services/bookings.js';
const router=Router();router.use(auth);
router.get('/',asyncRoute(async(req,res)=>{
  const {rows}=await db(`SELECT b.id,b.request_id AS "requestId",b.ride_id AS "rideId",b.rider_id AS "riderId",
  r.driver_id AS "driverId",r.origin_label AS "originLabel",r.destination_label AS "destinationLabel",
  r.departure_time AS "departureTime", b.passengers,b.status,b.created_at AS "createdAt",
  rider.full_name AS "riderName",driver.full_name AS "driverName"
  FROM bookings b JOIN ride_offers r ON r.id=b.ride_id JOIN users rider ON rider.id=b.rider_id JOIN users driver ON driver.id=r.driver_id
  WHERE b.rider_id=$1 OR r.driver_id=$1 ORDER BY r.departure_time DESC LIMIT 100`,[req.user.id]);
  res.json({bookings:rows});
}));
router.get('/:id/messages',asyncRoute(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const booking=await getAccessibleBooking(id,req.user.id);
  const {rows}=await db(`SELECT m.id,m.booking_id AS "bookingId",m.sender_id AS "senderId",u.full_name AS "senderName",m.body,m.created_at AS "createdAt"
    FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.booking_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,[booking.id]);
  res.json({messages:rows.reverse()});
}));
export default router;
