import http from 'node:http';
import {config,validateConfig} from './config.js';
import {pool} from './db.js';
import app from './app.js';
import {attachChat} from './socket.js';
validateConfig();
const server=http.createServer(app);
const io=attachChat(server);
server.listen(config.port,()=>console.log(`UNT Carpool backend listening on http://localhost:${config.port}`));
async function shutdown() {
  console.log('Shutting down...');
  io.close();
  server.close(async()=>{await pool.end();process.exit(0);});
  setTimeout(()=>process.exit(1),10_000).unref();
}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
