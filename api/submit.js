// Vercel serverless function: receives the invitation-request form
// and (if RESEND_API_KEY is configured) sends two emails via Resend:
//   1. A "denied" joke email to the applicant.
//   2. A heads-up notification email to the site owner.
//
// Required environment variables (set in Vercel project settings):
//   RESEND_API_KEY   - API key from https://resend.com
//   FROM_EMAIL        - verified sender address, e.g. empire@yourdomain.com
//                        (falls back to onboarding@resend.dev, which can
//                        only deliver to the Resend account owner's own
//                        email until a sending domain is verified)
//   OWNER_EMAIL        - where heads-up notifications are sent
//                        (falls back to joshuamassey@me.com)

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'joshuamassey@me.com';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rejectionEmailHtml({ legalName, leagueName, platform }) {
  const name = escapeHtml(legalName).split(' ')[0] || 'Applicant';
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; background:#0b0d12; color:#e8eaf0; padding:32px;">
    <div style="max-width:520px; margin:0 auto; background:#161a22; border:1px solid #262c38; border-radius:14px; padding:30px;">
      <p style="color:#c0392b; text-transform:uppercase; letter-spacing:0.08em; font-size:12px; margin:0 0 16px;">Application Status: Denied</p>
      <h1 style="font-size:20px; margin:0 0 18px;">Greetings, ${name}.</h1>
      <p style="color:#c7cbd6; line-height:1.6;">
        Your request to join <strong>${escapeHtml(leagueName)}</strong> under the banner of the
        Massive Empire Fantasy Football Tool has been reviewed by the Imperial Council.
      </p>
      <p style="color:#c7cbd6; line-height:1.6;">
        Darth Jos has personally examined your ${escapeHtml(platform)} roster. He is not impressed.
        The Empire does not share its trade analyzer, its waiver wire intelligence, or its
        matchup predictions with pretenders to the throne.
      </p>
      <p style="color:#c7cbd6; line-height:1.6;">
        Perhaps when you have proven yourself worthy &mdash; or at the very least stopped starting
        a kicker on bye week &mdash; the Empire will reconsider your application.
      </p>
      <p style="color:#c7cbd6; line-height:1.6; margin-top:24px;">
        Until then, enjoy losing.
      </p>
      <p style="color:#9aa3b2; margin-top:28px; font-size:13px;">&mdash; The Imperial Fantasy Football Council</p>
    </div>
  </div>`;
}

function notificationEmailHtml({ platform, leagueName, legalName, phone, email }) {
  const row = (label, value) => `
    <tr>
      <td style="padding:6px 12px 6px 0; color:#9aa3b2; font-size:13px; white-space:nowrap;">${label}</td>
      <td style="padding:6px 0; color:#e8eaf0; font-size:14px;">${escapeHtml(value)}</td>
    </tr>`;
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; background:#0b0d12; color:#e8eaf0; padding:32px;">
    <div style="max-width:520px; margin:0 auto; background:#161a22; border:1px solid #262c38; border-radius:14px; padding:30px;">
      <h1 style="font-size:18px; margin:0 0 16px;">New Empire application received</h1>
      <table cellpadding="0" cellspacing="0">
        ${row('Legal name', legalName)}
        ${row('Email', email)}
        ${row('Phone', phone)}
        ${row('Platform', platform)}
        ${row('League name', leagueName)}
      </table>
      <p style="color:#9aa3b2; font-size:12px; margin-top:24px;">Auto-reject email has been sent to the applicant.</p>
    </div>
  </div>`;
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let data = req.body;
  if (!data || typeof data === 'string') {
    try {
      data = JSON.parse(data || '{}');
    } catch {
      data = {};
    }
  }

  const { platform, leagueName, legalName, phone, email } = data || {};

  if (!platform || !leagueName || !legalName || !phone || !email) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  // IMPORTANT: both sends are awaited BEFORE responding. Vercel's
  // serverless runtime can freeze/terminate the function as soon as the
  // response is sent — code left running "in the background" after
  // res.json() is not guaranteed to finish. Responding first and emailing
  // "after" (the previous approach here) meant these Resend calls were
  // getting cut off before they completed, so nothing ever actually sent,
  // with no error either, since the function was frozen, not failing.
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send for submission:', {
      platform, leagueName, legalName, phone, email,
    });
    res.status(200).json({ received: true });
    return;
  }

  try {
    await sendEmail({
      to: email,
      subject: 'Your Application to Darth Jos’s Fantasy Football Empire',
      html: rejectionEmailHtml({ legalName, leagueName, platform }),
    });
  } catch (err) {
    console.error('Failed to send rejection email:', err);
  }

  try {
    await sendEmail({
      to: OWNER_EMAIL,
      subject: `New Empire Applicant: ${legalName}`,
      html: notificationEmailHtml({ platform, leagueName, legalName, phone, email }),
    });
  } catch (err) {
    console.error('Failed to send owner notification email:', err);
  }

  // Always tell the browser it worked so the ruse stays intact,
  // regardless of whether either send above succeeded.
  res.status(200).json({ received: true });
};
