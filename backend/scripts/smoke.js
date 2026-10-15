// Full-stack development smoke test. Requires running server + PostGIS DB.
// Creates synthetic demo accounts and data. Never run against production.
import 'dotenv/config';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {io as clientIO} from 'socket.io-client';
import pg from 'pg';
if (process.env.NODE_ENV === 'production') throw new Error('Do not run smoke test in production.');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL.');
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
const base=process.env.SMOKE_URL || 'http://localhost:4000';
async function call(method,path,body,token) {
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body ? JSON.stringify(body):undefined});
  const value=await r.json();
  return {...value, status:r.status};
}
async function signup(label,unique) {
  const email=`${label}${unique}@my.unt.edu`;
  const response=await call('POST','/api/auth/register',{fullName:`Smoke ${label}`,email,password:'SmokePassword123!'});
  assert.equal(response.status,201,JSON.stringify(response));
  // Only to bypass sending real mail in the synthetic development fixture.
  await db.query('UPDATE users SET email_verified=TRUE WHERE email=$1',[email]);
  const login=await call('POST','/api/auth/login',{email,password:'SmokePassword123!'});
  assert.equal(login.status,200,JSON.stringify(login));
  return {email,id:login.user.id,token:login.token};
}
async function socketConnect(token) {
  const s=clientIO(base,{auth:{token},transports:['websocket'],reconnection:false,timeout:4000});
  await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});
  return s;
}
async function emitAck(socket,event,payload) {
  return await new Promise((resolve,reject)=>{
    socket.timeout(4000).emit(event,payload,(err,res)=>err?reject(err):resolve(res));
  });
}
try {
  assert.equal((await call('GET','/api/health')).status,200);
  const suffix=Date.now().toString(36);
  const [driver,riderA,riderB]=await Promise.all([signup('driver',suffix),signup('ridera',suffix),signup('riderb',suffix)]);
  const vehicle=await call('PUT','/api/vehicles/me',{make:'Honda',model:'Civic',modelYear:2022,color:'Silver',seatCapacity:3},driver.token);
  assert.equal(vehicle.status,200);
  const origin={label:'Discovery Park, Denton',lat:33.2533,lng:-97.1520};
  const destination={label:'UNT Chilton Hall, Denton',lat:33.2094,lng:-97.1528};
  const departureTime=new Date(Date.now()+60*60_000).toISOString();
  const posted=await call('POST','/api/rides',{origin,destination,departureTime,seats:1},driver.token);
  assert.equal(posted.status,201,JSON.stringify(posted));
  const rideId=posted.ride.id;
  const params=new URLSearchParams({pickupLat:String(origin.lat),pickupLng:String(origin.lng),destinationLat:String(destination.lat),destinationLng:String(destination.lng),departureTime});
  const search=await call('GET',`/api/rides/search?${params}`,undefined,riderA.token);
  assert.equal(search.status,200,JSON.stringify(search));
  assert(search.rides.some(r=>r.id===rideId));
  const [requestA,requestB]=await Promise.all([
    call('POST',`/api/rides/${rideId}/requests`,{passengers:1,pickup:origin},riderA.token),
    call('POST',`/api/rides/${rideId}/requests`,{passengers:1,pickup:origin},riderB.token)
  ]);
  assert.equal(requestA.status,201);assert.equal(requestB.status,201);
  const [acceptA,acceptB]=await Promise.all([
    call('PUT',`/api/requests/${requestA.request.id}/accept`,undefined,driver.token),
    call('PUT',`/api/requests/${requestB.request.id}/accept`,undefined,driver.token)
  ]);
  const successes=[acceptA,acceptB].filter(r=>r.status===200);
  const failures=[acceptA,acceptB].filter(r=>r.status===409);
  assert.equal(successes.length,1,`Expected one accepted: ${JSON.stringify([acceptA,acceptB])}`);
  assert.equal(failures.length,1,'Expected the second seat request to be rejected');
  const accepted=successes[0].booking;
  const rider=acceptA.status===200?riderA:riderB;
  const seats=await db.query('SELECT seats_available FROM ride_offers WHERE id=$1',[rideId]);
  assert.equal(seats.rows[0].seats_available,0);
  const [driverSocket,riderSocket]=await Promise.all([socketConnect(driver.token),socketConnect(rider.token)]);
  try {
    assert((await emitAck(driverSocket,'chat:join',{bookingId:accepted.id})).ok);
    assert((await emitAck(riderSocket,'chat:join',{bookingId:accepted.id})).ok);
    const incoming=new Promise(resolve=>riderSocket.once('chat:message',resolve));
    const delivered=await emitAck(driverSocket,'chat:send',{bookingId:accepted.id,body:'See you at Discovery Park!'});
    assert(delivered.ok);
    const event=await Promise.race([incoming,delay(4000).then(()=>{throw new Error('Socket.IO message not delivered');})]);
    assert.equal(event.body,'See you at Discovery Park!');
  }finally {driverSocket.disconnect();riderSocket.disconnect();}
  const history=await call('GET',`/api/bookings/${accepted.id}/messages`,undefined,rider.token);
  assert.equal(history.status,200);assert.equal(history.messages.length,1);
  await db.query("UPDATE ride_offers SET departure_time=NOW()-INTERVAL '2 minutes' WHERE id=$1",[rideId]);
  const completed=await call('POST',`/api/rides/${rideId}/complete`,undefined,driver.token);
  assert.equal(completed.status,200,JSON.stringify(completed));
  const reviewed=await call('POST','/api/reviews',{bookingId:accepted.id,rating:5,comment:'Great trip'},rider.token);
  assert.equal(reviewed.status,201,JSON.stringify(reviewed));
  console.log('PASS: register, verified access, vehicles, PostGIS matching, requests, concurrent seat protection, booking, Socket.IO chat, stored messages, complete ride, review.');
  console.log(`Synthetic ride ID: ${rideId}`);
} finally {await db.end();}
