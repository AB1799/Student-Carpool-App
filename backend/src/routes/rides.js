import {Router} from 'express';
import {z} from 'zod';
import {db,transaction} from '../db.js';
import {auth,requireVerified} from '../middleware/auth.js';
import {asyncRoute,HttpError,assert} from '../lib/errors.js';
import {locationSchema,departureSchema,uuid,safeInt} from '../lib/geo.js';
import {rankMatches} from '../lib/matching.js';
import {notify} from '../services/notifications.js';
const router=Router(); router.use(auth);
const rideBody=z.object({origin:locationSchema,destination:locationSchema,departureTime:departureSchema,seats:safeInt(1,8)}).strict();
const searchSchema=z.object({pickupLat:z.coerce.number().min(-90).max(90),pickupLng:z.coerce.number().min(-180).max(180),destinationLat:z.coerce.number().min(-90).max(90),destinationLng:z.coerce.number().min(-180).max(180),departureTime:departureSchema,seats:safeInt(1,8).default(1),pickupRadiusMeters:safeInt(100,20000).default(5000),destinationRadiusMeters:safeInt(100,20000).default(6000),timeWindowMinutes:safeInt(5,180).default(60)}).strict();
const rideSelect=`r.id,r.driver_id AS "driverId",u.full_name AS "driverName",
 (SELECT ROUND(AVG(rv.rating)::numeric,1) FROM reviews rv WHERE rv.reviewed_id=r.driver_id) AS "driverRating",r.origin_label AS "originLabel",r.destination_label AS "destinationLabel",
 ST_Y(r.origin::geometry) AS "originLat",ST_X(r.origin::geometry) AS "originLng",
 ST_Y(r.destination::geometry) AS "destinationLat",ST_X(r.destination::geometry) AS "destinationLng",
 r.departure_time AS "departureTime",r.seats_total AS "seatsTotal",r.seats_available AS "seatsAvailable",r.status,r.created_at AS "createdAt",
 v.make AS "vehicleMake",v.model AS "vehicleModel",v.color AS "vehicleColor"`;
const fromRide=`FROM ride_offers r JOIN users u ON u.id=r.driver_id JOIN vehicles v ON v.id=r.vehicle_id`;
router.get('/search',requireVerified,asyncRoute(async(req,res)=>{
  const p=searchSchema.parse(req.query);
  assert(new Date(p.departureTime).getTime() > Date.now()-60*60*1000,400,'Search time is too far in the past');
  const settings={pickupRadiusMeters:p.pickupRadiusMeters,destinationRadiusMeters:p.destinationRadiusMeters,timeWindowMinutes:p.timeWindowMinutes};
  const {rows}=await db(`SELECT ${rideSelect},
    ST_Distance(r.origin,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography) AS pickup_distance_meters,
    ST_Distance(r.destination,ST_SetSRID(ST_MakePoint($4,$3),4326)::geography) AS destination_distance_meters,
    ABS(EXTRACT(EPOCH FROM (r.departure_time-$5::timestamptz)))/60 AS time_difference_minutes
    ${fromRide}
    WHERE r.status='OPEN' AND u.suspended=FALSE AND r.driver_id<>$6
    AND r.seats_available >= $7 AND r.departure_time > NOW()
    AND r.departure_time BETWEEN $5::timestamptz - ($10::int*INTERVAL '1 minute') AND $5::timestamptz + ($10::int*INTERVAL '1 minute')
    AND ST_DWithin(r.origin,ST_SetSRID(ST_MakePoint($2,$1),4326)::geography,$8)
    AND ST_DWithin(r.destination,ST_SetSRID(ST_MakePoint($4,$3),4326)::geography,$9)
    AND NOT EXISTS(SELECT 1 FROM ride_requests rr WHERE rr.ride_id=r.id AND rr.rider_id=$6 AND rr.status IN ('PENDING','ACCEPTED'))
    LIMIT 100`,[p.pickupLat,p.pickupLng,p.destinationLat,p.destinationLng,p.departureTime,req.user.id,p.seats,p.pickupRadiusMeters,p.destinationRadiusMeters,p.timeWindowMinutes]);
  const rides=rankMatches(rows,settings).map(({pickup_distance_meters,destination_distance_meters,time_difference_minutes,...rest})=>rest);
  res.json({rides,searchSettings:settings,ranking:'50% pickup distance, 25% destination distance, 25% time compatibility (provisional)'});
}));
router.get('/mine',asyncRoute(async(req,res)=>{
  const {rows}=await db(`SELECT ${rideSelect} ${fromRide} WHERE r.driver_id=$1 ORDER BY r.departure_time DESC LIMIT 100`,[req.user.id]);
  res.json({rides:rows});
}));
router.post('/',requireVerified,asyncRoute(async(req,res)=>{
  const b=rideBody.parse(req.body);
  assert(new Date(b.departureTime)>new Date(),400,'Departure must be in the future');
  const {rows:vehicles}=await db('SELECT id,seat_capacity FROM vehicles WHERE user_id=$1',[req.user.id]);
  const v=vehicles[0];assert(v,400,'Add your vehicle before posting a ride','VEHICLE_REQUIRED');
  assert(b.seats<=v.seat_capacity,400,'Seats exceed your vehicle capacity');
  const {rows}=await db(`INSERT INTO ride_offers(driver_id,vehicle_id,origin_label,destination_label,origin,destination,departure_time,seats_total,seats_available)
     VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,ST_SetSRID(ST_MakePoint($7,$8),4326)::geography,$9,$10,$10)
     RETURNING id,status,seats_total AS "seatsTotal",seats_available AS "seatsAvailable",departure_time AS "departureTime"`,[req.user.id,v.id,b.origin.label,b.destination.label,b.origin.lng,b.origin.lat,b.destination.lng,b.destination.lat,b.departureTime,b.seats]);
  res.status(201).json({ride:rows[0]});
}));
router.get('/:id',asyncRoute(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const {rows}=await db(`SELECT ${rideSelect},
    CASE WHEN r.driver_id=$2 OR EXISTS(SELECT 1 FROM bookings b WHERE b.ride_id=r.id AND b.rider_id=$2 AND b.status IN ('CONFIRMED','COMPLETED')) THEN v.license_plate ELSE NULL END AS "licensePlate"
    ${fromRide} WHERE r.id=$1`,[id,req.user.id]);
  assert(rows[0],404,'Ride not found','NOT_FOUND');
  res.json({ride:rows[0]});
}));
router.put('/:id',requireVerified,asyncRoute(async(req,res)=>{
  const id=uuid.parse(req.params.id);const b=rideBody.parse(req.body);
  assert(new Date(b.departureTime)>new Date(),400,'Departure must be in the future');
  const ride=await transaction(async client=>{
    const {rows}=await client.query('SELECT r.*,v.seat_capacity FROM ride_offers r JOIN vehicles v ON r.vehicle_id=v.id WHERE r.id=$1 FOR UPDATE OF r',[id]);
    const r=rows[0];assert(r && r.driver_id===req.user.id,404,'Ride not found','NOT_FOUND');
    assert(r.status==='OPEN',409,'Only open rides can be edited');
    assert(b.seats<=r.seat_capacity,400,'Seats exceed vehicle capacity');
    const booked=await client.query('SELECT 1 FROM bookings WHERE ride_id=$1 AND status=$2 LIMIT 1',[id,'CONFIRMED']);
    assert(!booked.rowCount,409,'Cannot change ride details after accepting bookings; cancel the ride instead');
    const update=await client.query(`UPDATE ride_offers SET origin_label=$2,destination_label=$3,
    origin=ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,destination=ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,
    departure_time=$8,seats_total=$9,seats_available=$9,updated_at=NOW() WHERE id=$1 RETURNING id,status`,
    [id,b.origin.label,b.destination.label,b.origin.lng,b.origin.lat,b.destination.lng,b.destination.lat,b.departureTime,b.seats]);
    return update.rows[0];
  });
  res.json({ride});
}));
router.post('/:id/cancel',requireVerified,asyncRoute(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const riders=await transaction(async client=>{
    const {rows}=await client.query('SELECT driver_id,status FROM ride_offers WHERE id=$1 FOR UPDATE',[id]);
    const r=rows[0];assert(r && r.driver_id===req.user.id,404,'Ride not found','NOT_FOUND');
    assert(r.status==='OPEN',409,'Only open rides can be cancelled');
    const affected=await client.query(`SELECT DISTINCT rider_id FROM ride_requests WHERE ride_id=$1 AND status IN ('PENDING','ACCEPTED')`,[id]);
    await client.query(`UPDATE ride_offers SET status='CANCELLED',updated_at=NOW() WHERE id=$1`,[id]);
    await client.query(`UPDATE ride_requests SET status='CANCELLED',updated_at=NOW() WHERE ride_id=$1 AND status IN ('PENDING','ACCEPTED')`,[id]);
    await client.query(`UPDATE bookings SET status='CANCELLED' WHERE ride_id=$1 AND status='CONFIRMED'`,[id]);
    return affected.rows.map(v=>v.rider_id);
  });
  await Promise.all(riders.map(riderId=>notify(riderId,'RIDE_CANCELLED','Ride cancelled','Your driver cancelled this ride.',{rideId:id})));
  res.json({message:'Ride cancelled'});
}));
router.post('/:id/complete',requireVerified,asyncRoute(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const riders=await transaction(async client=>{
    const {rows}=await client.query('SELECT driver_id,status,departure_time FROM ride_offers WHERE id=$1 FOR UPDATE',[id]);
    const r=rows[0];assert(r && r.driver_id===req.user.id,404,'Ride not found','NOT_FOUND');
    assert(r.status==='OPEN',409,'Ride cannot be completed');
    assert(new Date(r.departure_time)<=new Date(),409,'Cannot complete a ride before departure time');
    const {rows:bookings}=await client.query(`UPDATE bookings SET status='COMPLETED' WHERE ride_id=$1 AND status='CONFIRMED' RETURNING rider_id`,[id]);
    await client.query(`UPDATE ride_offers SET status='COMPLETED',updated_at=NOW() WHERE id=$1`,[id]);
    return bookings.map(r=>r.rider_id);
  });
  await Promise.all(riders.map(riderId=>notify(riderId,'RIDE_COMPLETED','Ride completed','You can now rate your driver.',{rideId:id})));
  res.json({message:'Ride completed'});
}));
router.get('/:id/requests',requireVerified,asyncRoute(async(req,res)=>{
  const id=uuid.parse(req.params.id);
  const {rows:ride}=await db('SELECT driver_id FROM ride_offers WHERE id=$1',[id]);
  assert(ride[0]?.driver_id===req.user.id,404,'Ride not found','NOT_FOUND');
  const {rows}=await db(`SELECT rr.id,rr.ride_id AS "rideId",rr.rider_id AS "riderId",u.full_name AS "riderName",rr.passengers,rr.status,rr.created_at AS "createdAt",rr.pickup_label AS "pickupLabel"
    FROM ride_requests rr JOIN users u ON u.id=rr.rider_id WHERE rr.ride_id=$1 ORDER BY rr.created_at DESC`,[id]);
  res.json({requests:rows});
}));
const requestSchema=z.object({passengers:safeInt(1,8).default(1),pickup:locationSchema.optional()}).strict();
router.post('/:id/requests',requireVerified,asyncRoute(async(req,res)=>{
  const id=uuid.parse(req.params.id);const b=requestSchema.parse(req.body);
  const {rows:rides}=await db('SELECT id,driver_id,seats_available,departure_time,status FROM ride_offers WHERE id=$1',[id]);
  const r=rides[0];assert(r && r.status==='OPEN' && new Date(r.departure_time)>new Date(),404,'Available ride not found','NOT_FOUND');
  assert(r.driver_id!==req.user.id,400,'You cannot request your own ride');
  assert(r.seats_available>=b.passengers,409,'Not enough available seats','RIDE_FULL');
  const {rows}=await db(`INSERT INTO ride_requests(ride_id,rider_id,passengers,pickup_label,pickup) VALUES ($1,$2,$3,$4,
    CASE WHEN $5::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($5,$6),4326)::geography END)
    RETURNING id,ride_id AS "rideId",passengers,status`,[id,req.user.id,b.passengers,b.pickup?.label??null,b.pickup?.lng??null,b.pickup?.lat??null]);
  await notify(r.driver_id,'NEW_REQUEST','New ride request','A UNT student requested a seat.',{rideId:id,requestId:rows[0].id});
  res.status(201).json({request:rows[0]});
}));
export default router;
