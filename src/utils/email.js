import nodemailer from 'nodemailer';

// SendGrid's SMTP relay always authenticates with this literal username,
// regardless of account — the real credential is the API key (the password).
const SMTP_USERNAME = 'apikey';

// Built once at module load and reused for every send, same as the DB pool.
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
  port: Number(process.env.EMAIL_PORT) || 587,
  auth: {
    user: SMTP_USERNAME,
    pass: process.env.SENDGRID_API_KEY,
  },
  // Bounded so a slow or unreachable relay can't stall the request that
  // triggered the send for nodemailer's much longer defaults (see D20).
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

export async function sendInviteEmail(toEmail, staffName, clinicName, inviteLink) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `You've been invited to join ${clinicName} on SwiftCare`,
    text: `Hi ${staffName},\n\nYou've been invited to join ${clinicName} on SwiftCare. Set your password to activate your account:\n${inviteLink}\n\nIf you weren't expecting this invite, you can ignore this email.`,
  });
}
