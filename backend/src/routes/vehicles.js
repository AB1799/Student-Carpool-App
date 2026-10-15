import {Router} from 'express';
import {z} from 'zod';
import {db} from '../db.js';
import {auth,requireVerified} from '../middleware/auth.js';
import {asyncRoute} from '../lib/errors.js';
const router=Router();router.use(auth);
const vehicleSchema=z.object({make:z.string().trim().min(1).max(60),model:z.string().trim().min(1).max(60),modelYear:z.number().int().min(1980).max(2100).nullable().optional(),color:z.string().trim().max(40).nullable().optional(),licensePlate:z.string().trim().max(20).nullable().optional(),seatCapacity:z.number().int().min(1).max(8)}).strict();
router.get('/me',asyncRoute(async(req,res)=>{
  const {rows}=await db('SELECT id,make,model,model_year AS "modelYear",color,license_plate AS "licensePlate",seat_capacity AS "seatCapacity" FROM vehicles WHERE user_id=$1',[req.user.id]);
  res.json({vehicle:rows[0]??null});
}));
router.put('/me',requireVerified,asyncRoute(async(req,res)=>{
  const b=vehicleSchema.parse(req.body);
  const {rows}=await db(`INSERT INTO vehicles(user_id,make,model,model_year,color,license_plate,seat_capacity) VALUES($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(user_id) DO UPDATE SET make=EXCLUDED.make,model=EXCLUDED.model,model_year=EXCLUDED.model_year,color=EXCLUDED.color,license_plate=EXCLUDED.license_plate,seat_capacity=EXCLUDED.seat_capacity
   RETURNING id,make,model,model_year AS "modelYear",color,license_plate AS "licensePlate",seat_capacity AS "seatCapacity"`,[req.user.id,b.make,b.model,b.modelYear??null,b.color??null,b.licensePlate??null,b.seatCapacity]);
  res.json({vehicle:rows[0]});
}));
export default router;
