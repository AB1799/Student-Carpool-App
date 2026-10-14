import nodemailer from 'nodemailer';
import {config} from '../config.js';
let transport;
function smtpTransport() {
  if(!transport) {
    if(!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error('SMTP_HOST and SMTP_FROM are required in smtp mode');
    transport=nodemailer.createTransport({
      host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),
      secure:Number(process.env.SMTP_PORT||587)===465,
      auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD} : undefined,
    });
  }
  return transport;
}
export async function sendVerificationEmail(email, code) {
  if(config.emailMode === 'console') {
    console.log(`[DEV ONLY] Verification code for ${email}: ${code}`);
    return;
  }
  await smtpTransport().sendMail({from:process.env.SMTP_FROM,to:email,subject:'UNT Carpool verification code',text:`Your UNT Carpool verification code is ${code}. It expires in 10 minutes.`});
}
