import {Router} from 'express';
import {z} from 'zod';
import {db,transaction} from '../db.js';
import {auth,requireVerified} from '../middleware/auth.js';
import {asyncRoute,assert} from '../lib/errors.js';
import {notify} from '../services/notifications.js';
const router=Router();router.use(auth,requireVerified);
router.get('/mine',asyncRoute(async(req,res)=>{
  const {rows}=await db(`SELECT rr.id,rr.ride_id AS "rideId",rr.passengers,rr.status,rr.created_at AS "createdAt",
    r.origin_label AS "originLabel",r.destination_label AS "destinationLabel",r.departure_time AS "departureTime",u.full_name AS "driverName"
    FROM ride_requests rr JOIN ride_offers r ON r.id=rr.ride_id JOIN users u ON u.id=r.driver_id
    WHERE rr.rider_id=$1 ORDER BY rr.created_at DESC LIMIT 100`,[req.user.id]);
  res.json({requests:rows});
}));
router.put('/:id/accept',asyncRoute(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const booking=await transaction(async client=>{
    const base=await client.query('SELECT ride_id FROM ride_requests WHERE id=$1',[id]);
    assert(base.rows[0],404,'Request not found','NOT_FOUND');
    // Lock the parent ride first: concurrent accepts serialize on the SAME row.
    const result=await client.query('SELECT id,driver_id,seats_available,status,departure_time FROM ride_offers WHERE id=$1 FOR UPDATE',[base.rows[0].ride_id]);
    const ride=result.rows[0];
    assert(ride && ride.driver_id===req.user.id,404,'Request not found','NOT_FOUND');
    const request=await client.query('SELECT id,rider_id,passengers,status FROM ride_requests WHERE id=$1 FOR UPDATE',[id]);
    const rr=request.rows[0];
    assert(rr && rr.status==='PENDING',409,'Request is no longer pending','REQUEST_NOT_PENDING');
    assert(ride.status==='OPEN' && new Date(ride.departure_time)>new Date(),409,'Ride is not open','RIDE_CLOSED');
    assert(ride.seats_available>=rr.passengers,409,'Not enough seats available','RIDE_FULL');
    await client.query('UPDATE ride_offers SET seats_available=seats_available-$2,updated_at=NOW() WHERE id=$1',[ride.id,rr.passengers]);
    await client.query(`UPDATE ride_requests SET status='ACCEPTED',updated_at=NOW() WHERE id=$1`,[id]);
    const {rows}=await client.query(`INSERT INTO bookings(request_id,ride_id,rider_id,passengers) VALUES($1,$2,$3,$4)
      RETURNING id,request_id AS "requestId",ride_id AS "rideId",rider_id AS "riderId",passengers,status`,[id,ride.id,rr.rider_id,rr.passengers]);
    return rows[0];
  });
  await notify(booking.riderId,'REQUEST_ACCEPTED','Ride confirmed','Your ride request was accepted. You can now chat with your driver.',{bookingId:booking.id});
  res.json({booking});
}));
router.put('/:id/reject',asyncRoute(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const {rows}=await db(`UPDATE ride_requests rr SET status='REJECTED',updated_at=NOW()
     FROM ride_offers r WHERE rr.id=$1 AND rr.ride_id=r.id AND r.driver_id=$2 AND rr.status='PENDING'
     RETURNING rr.id,rr.rider_id AS "riderId",rr.ride_id AS "rideId"`,[id,req.user.id]);
  assert(rows[0],404,'Pending request not found','NOT_FOUND');
  await notify(rows[0].riderId,'REQUEST_REJECTED','Ride request declined','The driver could not accept this request.',{rideId:rows[0].rideId});
  res.json({message:'Request rejected'});
}));
export default router;
