import {Router} from 'express';
import {z} from 'zod';
import {db} from '../db.js';
import {auth,requireVerified,requireAdmin} from '../middleware/auth.js';
import {asyncRoute,assert} from '../lib/errors.js';
const router=Router();router.use(auth);
router.post('/',requireVerified,asyncRoute(async(req,res)=>{
  const b=z.object({reportedUserId:z.string().uuid(),reason:z.string().trim().min(10).max(1000)}).strict().parse(req.body);
  assert(b.reportedUserId!==req.user.id,400,'You cannot report yourself');
  const {rows:targets}=await db('SELECT id FROM users WHERE id=$1',[b.reportedUserId]);
  assert(targets.length,404,'User not found','NOT_FOUND');
  const {rows}=await db(`INSERT INTO reports(reporter_id,reported_id,reason) VALUES($1,$2,$3)
    RETURNING id,status,created_at AS "createdAt"`,[req.user.id,b.reportedUserId,b.reason]);
  res.status(201).json({report:rows[0]});
}));
router.get('/',requireAdmin,asyncRoute(async(req,res)=>{
  const {rows}=await db(`SELECT r.id,r.reporter_id AS "reporterId",r.reported_id AS "reportedId",r.reason,r.status,r.created_at AS "createdAt"
    FROM reports r ORDER BY CASE WHEN r.status='OPEN' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`);
  res.json({reports:rows});
}));
router.put('/:id/resolve',requireAdmin,asyncRoute(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const {rows}=await db(`UPDATE reports SET status='RESOLVED',resolved_by=$2,resolved_at=NOW() WHERE id=$1 RETURNING id,status`,[id,req.user.id]);
  assert(rows[0],404,'Report not found','NOT_FOUND');res.json({report:rows[0]});
}));
router.put('/users/:id/suspend',requireAdmin,asyncRoute(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const b=z.object({suspended:z.boolean()}).strict().parse(req.body);
  assert(id!==req.user.id,400,'You cannot suspend your own account');
  const {rows}=await db(`UPDATE users SET suspended=$2,updated_at=NOW() WHERE id=$1 AND role='STUDENT' RETURNING id,suspended`,[id,b.suspended]);
  assert(rows[0],404,'Student not found','NOT_FOUND');
  res.json({user:rows[0]});
}));
export default router;
