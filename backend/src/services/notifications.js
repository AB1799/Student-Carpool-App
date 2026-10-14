import { db } from '../db.js';
import {config} from '../config.js';
export async function notify(userId, kind, title, body, metadata={}) {
  try {
    const {rows}=await db(`INSERT INTO notifications(user_id,kind,title,body,metadata)
       VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id`,[userId,kind,title,body,JSON.stringify(metadata)]);
    if(config.expoEnabled) {
      const tok=await db('SELECT expo_push_token FROM users WHERE id=$1',[userId]);
      const to=tok.rows[0]?.expo_push_token;
      if(to) {
        const headers={'Content-Type':'application/json','Accept':'application/json'};
        if(config.expoToken) headers.Authorization=`Bearer ${config.expoToken}`;
        const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers,body:JSON.stringify({to,title,body,data:metadata}),signal:AbortSignal.timeout(4000)});
        if (!response.ok) console.error('Expo push returned status',response.status);
      }
    }
    return rows[0];
  } catch(err) {
    // Request/booking DB state is authoritative; failed external notifications must not undo it.
    console.error('Notification delivery failed:',err.message);
  }
}
