import {Router} from 'express';
import {z} from 'zod';
import {db} from '../db.js';
import {auth} from '../middleware/auth.js';
import {asyncRoute,HttpError} from '../lib/errors.js';
const router=Router();router.use(auth);
const publicUser=`id,full_name AS "fullName", email,email_verified AS "emailVerified", role, photo_url AS "photoUrl", created_at AS "createdAt"`;
router.get('/me',asyncRoute(async(req,res)=>{
  const {rows}=await db(`SELECT ${publicUser} FROM users WHERE id=$1`,[req.user.id]);
  res.json({user:rows[0]});
}));
router.put('/me',asyncRoute(async(req,res)=>{
  const body=z.object({fullName:z.string().trim().min(2).max(120).optional(),photoUrl:z.string().url().max(2000).nullable().optional()}).strict().parse(req.body);
  if(!Object.keys(body).length) throw new HttpError(400,'Provide at least one field');
  const {rows}=await db(`UPDATE users SET full_name=COALESCE($2,full_name),photo_url=CASE WHEN $3 THEN $4 ELSE photo_url END,updated_at=NOW()
     WHERE id=$1 RETURNING ${publicUser}`,[req.user.id,body.fullName ?? null,Object.hasOwn(body,'photoUrl'),body.photoUrl ?? null]);
  res.json({user:rows[0]});
}));
router.post('/me/push-token',asyncRoute(async(req,res)=>{
  const body=z.object({token:z.string().regex(/^(Expo(nent)?PushToken)\[[^\]]+\]$/).nullable()}).strict().parse(req.body);
  await db('UPDATE users SET expo_push_token=$2 WHERE id=$1',[req.user.id,body.token]);
  res.json({message:'Push token updated'});
}));
router.get('/me/notifications',asyncRoute(async(req,res)=>{
  const {rows}=await db('SELECT id,kind,title,body,metadata,read_at AS "readAt",created_at AS "createdAt" FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);
  res.json({notifications:rows});
}));
router.patch('/me/notifications/:id/read',asyncRoute(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const {rowCount}=await db('UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2',[id,req.user.id]);
  if(!rowCount) throw new HttpError(404,'Notification not found','NOT_FOUND');
  res.json({message:'Marked as read'});
}));
export default router;
