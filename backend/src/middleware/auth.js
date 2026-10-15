import jwt from 'jsonwebtoken';
import {config} from '../config.js';
import {db} from '../db.js';
import {asyncRoute, HttpError} from '../lib/errors.js';
export const auth = asyncRoute(async (req,res,next) => {
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if(!match) throw new HttpError(401,'Bearer token required','UNAUTHORIZED');
  let claims;
  try {claims=jwt.verify(match[1],config.jwtSecret,{algorithms:['HS256'],issuer:'unt-carpool'});}
  catch {throw new HttpError(401,'Invalid or expired token','INVALID_TOKEN');}
  const {rows}=await db('SELECT id,email,full_name,email_verified,role,suspended FROM users WHERE id=$1',[claims.sub]);
  if(!rows[0] || rows[0].suspended) throw new HttpError(403,'Account unavailable or suspended','ACCOUNT_UNAVAILABLE');
  req.user=rows[0]; next();
});
export function requireVerified(req,res,next) {
  if(!req.user.email_verified) return next(new HttpError(403,'Verify your UNT email first','EMAIL_NOT_VERIFIED'));
  next();
}
export function requireAdmin(req,res,next) {
  if(req.user.role !== 'ADMIN') return next(new HttpError(403,'Admin access required','FORBIDDEN'));
  next();
}
