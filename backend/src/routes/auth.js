import {Router} from 'express';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {createHmac,randomInt,timingSafeEqual} from 'node:crypto';
import {db} from '../db.js';
import {config} from '../config.js';
import {asyncRoute,HttpError,assert} from '../lib/errors.js';
import {sendVerificationEmail} from '../services/email.js';
import {rateLimit} from 'express-rate-limit';
const router=Router();
router.use(rateLimit({windowMs:15*60*1000,limit:35,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many authentication requests. Try again later.',code:'RATE_LIMITED'}}));
const email=z.string().trim().toLowerCase().email().max(254).refine(s=>s.endsWith('@my.unt.edu'), 'A @my.unt.edu student email is required');
const password=z.string().min(8).max(128);
const makeCode=()=>String(randomInt(1000000)).padStart(6,'0');
const codeHash=(userId,code)=>createHmac('sha256',config.jwtSecret).update(`${userId}:${code}`).digest('hex');
async function issueCode(user) {
  const code=makeCode();
  await db(`INSERT INTO email_verification(user_id,code_hash,expires_at,failed_attempts,issued_at)
    VALUES($1,$2,NOW()+INTERVAL '10 minutes',0,NOW()) ON CONFLICT(user_id)
    DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,failed_attempts=0,issued_at=NOW()`,[user.id,codeHash(user.id,code)]);
  await sendVerificationEmail(user.email,code);
}
function createToken(user) { return jwt.sign({sub:user.id},config.jwtSecret,{algorithm:'HS256',expiresIn:'12h',issuer:'unt-carpool'}); }
router.post('/register',asyncRoute(async(req,res)=>{
  const body=z.object({fullName:z.string().trim().min(2).max(120),email,password}).strict().parse(req.body);
  const hash=await bcrypt.hash(body.password,12);
  const result=await db('INSERT INTO users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id,email,full_name,email_verified',[body.fullName,body.email,hash]);
  try { await issueCode(result.rows[0]); }
  catch (err) {console.error('Verification email dispatch error:',err);throw new HttpError(503,'Account created; could not deliver code. Use resend verification.','EMAIL_UNAVAILABLE');}
  res.status(201).json({message:'Account created. Check your UNT email for the code.',user:result.rows[0],verificationRequired:true});
}));
router.post('/verify-email',asyncRoute(async(req,res)=>{
  const body=z.object({email,code:z.string().regex(/^\d{6}$/)}).strict().parse(req.body);
  const userResult=await db('SELECT id,email,email_verified FROM users WHERE email=$1',[body.email]);
  const user=userResult.rows[0];
  assert(user,400,'Invalid email or verification code','INVALID_CODE');
  if(user.email_verified) return res.json({message:'Already verified'});
  const vr=await db('SELECT code_hash,expires_at,failed_attempts FROM email_verification WHERE user_id=$1',[user.id]);
  const v=vr.rows[0];
  assert(v && new Date(v.expires_at)>new Date() && v.failed_attempts<5,400,'Code expired or too many attempts. Request another code.','CODE_EXPIRED');
  const provided=Buffer.from(codeHash(user.id,body.code),'hex');
  const stored=Buffer.from(v.code_hash,'hex');
  if(provided.length!==stored.length || !timingSafeEqual(provided,stored)) {
    await db('UPDATE email_verification SET failed_attempts=failed_attempts+1 WHERE user_id=$1',[user.id]);
    throw new HttpError(400,'Invalid email or verification code','INVALID_CODE');
  }
  await db('UPDATE users SET email_verified=true,updated_at=NOW() WHERE id=$1',[user.id]);
  await db('DELETE FROM email_verification WHERE user_id=$1',[user.id]);
  res.json({message:'Email verified. You can sign in now.'});
}));
router.post('/resend-verification',asyncRoute(async(req,res)=>{
  const body=z.object({email}).strict().parse(req.body);
  const {rows}=await db('SELECT id,email,email_verified FROM users WHERE email=$1',[body.email]);
  if(rows[0] && !rows[0].email_verified) {
    const {rows:recent}=await db('SELECT issued_at FROM email_verification WHERE user_id=$1',[rows[0].id]);
    if(!recent[0] || Date.now()-new Date(recent[0].issued_at).getTime()>60_000) await issueCode(rows[0]);
  }
  res.json({message:'If this account needs verification, a code will be sent. Please wait at least 60 seconds before resending.'});
}));
router.post('/login',asyncRoute(async(req,res)=>{
  const body=z.object({email,password:z.string()}).strict().parse(req.body);
  const {rows}=await db('SELECT id,email,full_name,password_hash,email_verified,suspended,role FROM users WHERE email=$1',[body.email]);
  const user=rows[0];
  // Constant-timeish defense against username probing (bcrypt work even for missing users).
  const valid=await bcrypt.compare(body.password,user?.password_hash || '$2a$12$C6UzMDM.H6dfI/f/IKcEe.B2uFQqjiQK55c0Y1j3di1J.R2oJTh5m');
  assert(user && valid,401,'Invalid email or password','INVALID_CREDENTIALS');
  assert(!user.suspended,403,'Account is suspended','ACCOUNT_UNAVAILABLE');
  res.json({token:createToken(user),user:{id:user.id,email:user.email,fullName:user.full_name,emailVerified:user.email_verified,role:user.role}});
}));
export default router;
