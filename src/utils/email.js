// HTTPS Web API instead of the SMTP relay this used to go through (D20
// update): Railway — and PaaS hosts generally — block outbound SMTP, so the
// SMTP transport connection just times out there even though it works
// locally. This call rides on port 443 like any other outbound HTTPS
// request, which isn't blocked.
const SENDGRID_API_URL = process.env.SENDGRID_API_URL || 'https://api.sendgrid.com/v3/mail/send';

export async function sendInviteEmail(toEmail, staffName, clinicName, inviteLink) {
  const controller = new AbortController();
  // Same bounded-wait rationale as the old transporter's connectionTimeout:
  // the try/catch around this call lets the request through either way, but
  // an unbounded hang would still stall the response for minutes.
  const timeout = setTimeout(() => controller.abort(), 10000);

  let res;
  try {
    res = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: process.env.EMAIL_FROM },
        subject: `You've been invited to join ${clinicName} on SwiftCare`,
        content: [
          {
            type: 'text/plain',
            value: `Hi ${staffName},\n\nYou've been invited to join ${clinicName} on SwiftCare. Set your password to activate your account:\n${inviteLink}\n\nIf you weren't expecting this invite, you can ignore this email.`,
          },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid API responded ${res.status}: ${body}`);
  }
}
