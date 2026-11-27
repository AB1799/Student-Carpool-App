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
async function sendEmail(to, subject, text) {
  if(config.emailMode === 'brevo') {
    const response=await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',
      headers:{'api-key':process.env.BREVO_API_KEY,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        sender:{name:'UNT Carpool',email:process.env.BREVO_FROM},
        to:[{email:to}],
        subject,
        textContent:text,
      }),
      signal:AbortSignal.timeout(10_000),
    });
    if(response.body) await response.body.cancel().catch(()=>{});
    if(!response.ok) throw new Error(`Brevo email delivery failed (${response.status})`);
    return;
  }
  await smtpTransport().sendMail({from:process.env.SMTP_FROM,to,subject,text});
}
export async function sendVerificationEmail(email, code) {
  if(config.emailMode === 'console') {
    console.log(`[DEV ONLY] Verification code for ${email}: ${code}`);
    return;
  }
  await sendEmail(email,'UNT Carpool verification code',`Your UNT Carpool verification code is ${code}. It expires in 10 minutes.`);
}

export async function sendPasswordResetEmail(email, code) {
  if(config.emailMode === 'console') {
    console.log(`[DEV ONLY] Password reset code for ${email}: ${code}`);
    return;
  }
  await sendEmail(email,'Reset your UNT Carpool password',
    `Paste this reset code into UNT Carpool within 20 minutes:\n\n${code}\n\nIf you did not request this, you can ignore this message.`,
  );
}
