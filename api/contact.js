// Vercel serverless function: powers the "Get in touch" contact form used
// across the site (homepage + product pages). Sends a notification email
// to the site owner via Resend, with the sender's address set as the
// reply-to so you can respond directly from your inbox.
//
// The subject line is chosen SERVER-SIDE from a fixed lookup table below,
// keyed off a short "source" slug the form sends (e.g. "chairside"). The
// visitor's browser never controls the subject text in any way, so unlike
// a mailto: link, this one can't be edited before it's sent.
//
// Reuses the SAME environment variables as api/submit.js:
//   RESEND_API_KEY   - API key from https://resend.com
//   FROM_EMAIL        - verified sender address, e.g. hello@5280content.com
//                        (falls back to onboarding@resend.dev, which can
//                        only deliver to the Resend account owner's own
//                        email until a sending domain is verified)
//   OWNER_EMAIL        - where contact-form notifications are sent
//                        (falls back to joshuamassey@me.com)
//
// If these are already set up for the fantasy football invite form, this
// endpoint works immediately with zero extra configuration.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'joshuamassey@me.com';

// Locked subject lines, one per known contact-form location. Anything not
// in this list (or missing) falls back to the generic homepage subject —
// the visitor's input is never used to build the subject.
const SUBJECTS = {
  homepage: '5280 Content - Web Contact Form',
  chairside: '5280 Content - Web Contact Form: Chairside',
  'excel-a-route': '5280 Content - Web Contact Form: Excel-a-Route',
  'territory-text': '5280 Content - Web Contact Form: TerritoryText',
  'web-design': '5280 Content - Web Contact Form: Web Design',
};
const DEFAULT_SUBJECT = SUBJECTS.homepage;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notificationEmailHtml({ name, email, message, source }) {
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; background:#f4f6f8; padding:32px;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:30px;">
      <p style="color:#f97316; text-transform:uppercase; letter-spacing:0.08em; font-size:12px; margin:0 0 16px; font-weight:700;">New website contact form submission</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
        <tr>
          <td style="padding:6px 12px 6px 0; color:#64748b; font-size:13px; white-space:nowrap; vertical-align:top;">From</td>
          <td style="padding:6px 0; color:#0b1d2d; font-size:14px;">${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0; color:#64748b; font-size:13px; white-space:nowrap; vertical-align:top;">Page</td>
          <td style="padding:6px 0; color:#0b1d2d; font-size:14px;">${escapeHtml(source || 'unknown')}</td>
        </tr>
      </table>
      <p style="color:#64748b; font-size:13px; margin:0 0 6px; text-transform:uppercase; letter-spacing:0.05em;">Message</p>
      <p style="color:#0b1d2d; font-size:15px; line-height:1.6; white-space:pre-wrap;">${escapeHtml(message)}</p>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">Reply directly to this email to respond to ${escapeHtml(name)}.</p>
    </div>
  </div>`;
}

// A hard cap on how long we'll wait on Resend, so a slow/unresponsive API
// can't stall this function up to (or past) Vercel's own execution limit.
const SEND_TIMEOUT_MS = 8000;

async function sendEmail({ to, subject, html, replyTo }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
        reply_to: replyTo,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend error ${res.status}: ${body}`);
    }
  } finally {
    clearTimeout(timeoutId);
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

  const { name, email, message, source, website } = data || {};

  // Honeypot: a real visitor never fills this hidden field. Pretend
  // success so bots don't learn anything, but skip sending.
  if (website) {
    res.status(200).json({ ok: true });
    return;
  }

  if (!name || !email || !message || !EMAIL_RE.test(String(email))) {
    res.status(400).json({ error: 'Missing or invalid fields' });
    return;
  }

  // IMPORTANT: the email send is awaited BEFORE responding. Vercel's
  // serverless runtime can freeze/terminate the function as soon as the
  // response is sent — code left running "in the background" after
  // res.json() is not guaranteed to finish. Sending first and emailing
  // "after" (the previous approach here) meant the Resend call was
  // getting cut off before it completed, so nothing ever actually sent,
  // with no error either, since the function was frozen, not failing.
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send for contact form submission:', {
      name, email, source,
    });
    res.status(200).json({ ok: true });
    return;
  }

  const subject = SUBJECTS[source] || DEFAULT_SUBJECT;

  try {
    await sendEmail({
      to: OWNER_EMAIL,
      subject,
      html: notificationEmailHtml({ name, email, message, source }),
      replyTo: email,
    });
  } catch (err) {
    console.error('Failed to send contact form notification email:', err);
    // Still tell the visitor it succeeded — a delivery hiccup on our end
    // shouldn't surface as an error in their browser.
  }

  res.status(200).json({ ok: true });
};
