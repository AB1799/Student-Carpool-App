import {Router} from 'express';
import {z} from 'zod';
import {db} from '../db.js';
import {auth,requireVerified} from '../middleware/auth.js';
import {asyncRoute,assert} from '../lib/errors.js';
import {getAccessibleBooking} from '../services/bookings.js';
const router=Router();router.use(auth,requireVerified);
router.post('/',asyncRoute(async(req,res)=>{
  const b=z.object({bookingId:z.string().uuid(),rating:z.number().int().min(1).max(5),comment:z.string().trim().max(1000).optional()}).strict().parse(req.body);
  const booking=await getAccessibleBooking(b.bookingId,req.user.id);
  assert(booking.status==='COMPLETED',409,'Reviews are only allowed after completed rides');
  const other=booking.rider_id===req.user.id ? booking.driver_id : booking.rider_id;
  const {rows}=await db(`INSERT INTO reviews(booking_id,reviewer_id,reviewed_id,rating,comment) VALUES($1,$2,$3,$4,$5)
    RETURNING id,booking_id AS "bookingId",reviewed_id AS "reviewedId",rating,comment`,[b.bookingId,req.user.id,other,b.rating,b.comment??null]);
  res.status(201).json({review:rows[0]});
}));
export default router;
