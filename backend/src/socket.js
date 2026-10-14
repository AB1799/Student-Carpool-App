import jwt from 'jsonwebtoken';
import {Server} from 'socket.io';
import {z} from 'zod';
import {db} from './db.js';
import {config} from './config.js';
import {getAccessibleBooking} from './services/bookings.js';
const sendSchema=z.object({bookingId:z.string().uuid(),body:z.string().trim().min(1).max(2000)}).strict();
function acknowledge(callback,result) {if(typeof callback==='function') callback(result);}
export function attachChat(server) {
  const io=new Server(server,{cors:{origin:config.clientOrigins,methods:['GET','POST']},maxHttpBufferSize:10_000});
  io.use(async(socket,next)=>{
    try {
      const token=socket.handshake.auth?.token;
      if(!token) throw new Error('Missing token');
      const claims=jwt.verify(token,config.jwtSecret,{algorithms:['HS256'],issuer:'unt-carpool'});
      const {rows}=await db('SELECT id,email_verified,suspended FROM users WHERE id=$1',[claims.sub]);
      if(!rows[0] || !rows[0].email_verified || rows[0].suspended) throw new Error('User not authorized');
      socket.data.userId=rows[0].id;
      next();
    }catch {next(new Error('Unauthorized'));}
  });
  io.on('connection',socket=>{
    socket.data.sent=[];
    socket.on('chat:join',async(payload,ack)=>{
      try {
        const bookingId=z.string().uuid().parse(payload?.bookingId);
        const {rows:active}=await db('SELECT email_verified,suspended FROM users WHERE id=$1',[socket.data.userId]);
        if(!active[0] || !active[0].email_verified || active[0].suspended) throw new Error('User not authorized');
        const b=await getAccessibleBooking(bookingId,socket.data.userId);
        if(!['CONFIRMED','COMPLETED'].includes(b.status)) throw new Error('Chat unavailable for this booking');
        await socket.join(`booking:${bookingId}`);
        acknowledge(ack,{ok:true,bookingId});
      }catch(err){acknowledge(ack,{ok:false,error:err.message});}
    });
    socket.on('chat:send',async(payload,ack)=>{
      try {
        const b=sendSchema.parse(payload);
        const now=Date.now();
        socket.data.sent=socket.data.sent.filter(t=>now-t<60_000);
        if(socket.data.sent.length>=20) throw new Error('Message limit: wait a minute');
        const {rows:active}=await db('SELECT email_verified,suspended FROM users WHERE id=$1',[socket.data.userId]);
        if(!active[0] || !active[0].email_verified || active[0].suspended) throw new Error('User not authorized');
        const booking=await getAccessibleBooking(b.bookingId,socket.data.userId);
        if(!['CONFIRMED','COMPLETED'].includes(booking.status)) throw new Error('Chat unavailable for this booking');
        if(!socket.rooms.has(`booking:${b.bookingId}`)) throw new Error('Join booking chat before sending');
        const {rows}=await db(`INSERT INTO messages(booking_id,sender_id,body) VALUES($1,$2,$3)
          RETURNING id,booking_id AS "bookingId",sender_id AS "senderId",body,created_at AS "createdAt"`,[b.bookingId,socket.data.userId,b.body]);
        socket.data.sent.push(now);
        io.to(`booking:${b.bookingId}`).emit('chat:message',rows[0]);
        acknowledge(ack,{ok:true,message:rows[0]});
      }catch(err){acknowledge(ack,{ok:false,error:err.message});}
    });
    socket.on('chat:leave',payload=>{
      const result=z.object({bookingId:z.string().uuid()}).safeParse(payload);
      if(result.success) socket.leave(`booking:${result.data.bookingId}`);
    });
  });
  return io;
}
