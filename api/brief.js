// Website brief. Validates the structured form at /web-design/brief and
// emails it to the same inbox as the contact form. Subject is fixed here.
// Env vars match api/contact.js: RESEND_API_KEY, FROM_EMAIL, OWNER_EMAIL.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'joshuamassey@me.com';
const SUBJECT = '5280 Content - Website brief';
const SEND_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BASIC_INCLUDED = [
  'Home / landing page',
  'About us',
  'Contact us (form)',
  'Services and pricing',
  'FAQ',
  'Privacy page',
  'Sitemap',
  'Basic SEO and AI search setup',
  'Local business schema',
  'Mobile-friendly design',
  'SSL and domain connection',
  'Contact form spam protection',
  'Basic accessibility',
  'Google Business Profile link',
];

const ADDONS = {
  extra_pages: 'Extra pages',
  blog: 'Blog',
  gallery: 'Work / photo gallery',
  google_reviews: 'Google reviews display',
  scheduling: 'Book-a-bid / appointment scheduling',
  payments: 'Online payments or store',
  map: 'Map',
  branding: 'Custom logo and branding',
  copywriting: 'Copywriting',
  email_setup: 'Email setup',
  cms: 'Self-editing (CMS)',
  multi_language: 'Multi-language',
  integrations: 'Integrations',
};

const DOMAIN_CHOICES = {
  yes: 'Yes',
  no: 'No',
  not_sure: 'Not sure',
};

const TIMEFRAMES = {
  'as-soon-as-we-can': 'As soon as we can',
  'within-a-month': 'Within a month',
  'a-few-months': 'A few months',
  'no-fixed-date': 'No fixed date',
  'not-sure': 'Not sure',
};

const READINESS = {
  have: 'I have them',
  some: 'I have some',
  'need-help': 'I need help getting them',
};

const BUDGETS = {
  '': '',
  basic: 'The $500 build and $40 a month hosting',
  'basic-plus-addons': 'Basic package plus add-ons, to be quoted',
  'not-sure': 'Not sure',
  'prefer-not': "I'd rather not say",
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clip(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value == null || value === '') return [];
  return [String(value)];
}

function buildBrief(data) {
  const addons = [];
  for (const id of asArray(data.addons)) {
    if (!Object.prototype.hasOwnProperty.call(ADDONS, id)) continue;
    const item = { id, label: ADDONS[id], quotedSeparately: true };
    if (id === 'extra_pages') {
      const count = Number(data.extraPageCount);
      item.count = Number.isInteger(count) ? count : null;
    }
    if (id === 'integrations') item.detail = clip(data.integrationsDetail, 500);
    addons.push(item);
  }

  return {
    business: {
      name: clip(data.businessName, 120),
      contactName: clip(data.contactName, 120),
      email: clip(data.email, 200),
      phone: clip(data.phone, 40),
      currentWebsite: clip(data.currentWebsite, 300),
      ownsDomain: data.ownsDomain,
      ownsDomainLabel: DOMAIN_CHOICES[data.ownsDomain] || '',
      domainName: clip(data.domainName, 200),
      industry: clip(data.industry, 120),
      serviceArea: clip(data.serviceArea, 200),
    },
    basicPackage: {
      buildUsd: 500,
      hostingUsdPerMonth: 40,
      included: BASIC_INCLUDED,
    },
    addons,
    otherRequests: clip(data.otherRequests, 4000),
    project: {
      launchTimeframe: data.launchTimeframe,
      launchTimeframeLabel: TIMEFRAMES[data.launchTimeframe] || '',
      photos: data.photos,
      photosLabel: READINESS[data.photos] || '',
      text: data.text,
      textLabel: READINESS[data.text] || '',
      budget: data.budget || '',
      budgetLabel: BUDGETS[data.budget] || '',
      anythingElse: clip(data.anythingElse, 4000),
    },
  };
}

function validate(data) {
  if (!clip(data.businessName, 120)) return 'Add the business name.';
  if (!clip(data.contactName, 120)) return 'Add your name.';
  if (!EMAIL_RE.test(clip(data.email, 200))) return 'Add a valid email address.';
  if (!DOMAIN_CHOICES[data.ownsDomain]) return 'Say whether you own a domain.';
  if (!TIMEFRAMES[data.launchTimeframe]) return 'Choose a launch timeframe.';
  if (!READINESS[data.photos]) return 'Say whether you have photos.';
  if (!READINESS[data.text]) return 'Say whether you have text.';
  if (data.budget && !BUDGETS[data.budget]) return 'Choose a budget option from the list.';
  if (asArray(data.addons).includes('extra_pages')) {
    const count = Number(data.extraPageCount);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return 'Say how many extra pages, from 1 to 50.';
    }
  }
  return '';
}

function line(label, value) {
  const text = value ? escapeHtml(value) : '—';
  return `<tr><td style="padding:6px 16px 6px 0; color:#64748b; font-size:13px; vertical-align:top; white-space:nowrap;">${label}</td><td style="padding:6px 0; color:#0b1d2d; font-size:14px;">${text}</td></tr>`;
}

function briefEmailHtml(brief) {
  const addonLines = brief.addons.length
    ? brief.addons.map((item) => {
      const extra = item.count ? ` (${item.count})` : '';
      const detail = item.detail ? `: ${item.detail}` : '';
      return `<li>${escapeHtml(item.label + extra + detail)}</li>`;
    }).join('')
    : '<li>None selected</li>';
  const included = brief.basicPackage.included.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const json = escapeHtml(JSON.stringify(brief, null, 2));
  const b = brief.business;
  const p = brief.project;
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; background:#f4f6f8; padding:32px;">
    <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:30px;">
      <p style="color:#c2410c; text-transform:uppercase; letter-spacing:0.08em; font-size:12px; margin:0 0 8px; font-weight:700;">Website brief</p>
      <h1 style="font-size:20px; margin:0 0 18px; color:#0b1d2d;">${escapeHtml(b.name)}</h1>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
        ${line('Contact', b.contactName)}
        ${line('Email', b.email)}
        ${line('Phone', b.phone)}
        ${line('Current site', b.currentWebsite)}
        ${line('Owns a domain', b.ownsDomainLabel)}
        ${line('Domain', b.domainName)}
        ${line('Industry', b.industry)}
        ${line('Service area', b.serviceArea)}
      </table>
      <p style="color:#64748b; font-size:13px; margin:0 0 6px; text-transform:uppercase;">Basic package</p>
      <p style="margin:0 0 8px; color:#0b1d2d;">$500 one-time build and $40/month hosting. Included:</p>
      <ul style="margin:0 0 18px; color:#0b1d2d;">${included}</ul>
      <p style="color:#64748b; font-size:13px; margin:0 0 6px; text-transform:uppercase;">Add-ons, quoted separately</p>
      <ul style="margin:0 0 18px; color:#0b1d2d;">${addonLines}</ul>
      <p style="color:#64748b; font-size:13px; margin:0 0 6px; text-transform:uppercase;">Other requests</p>
      <p style="white-space:pre-wrap; color:#0b1d2d;">${escapeHtml(brief.otherRequests || '—')}</p>
      <table cellpadding="0" cellspacing="0" style="margin:18px 0;">
        ${line('Launch', p.launchTimeframeLabel)}
        ${line('Photos', p.photosLabel)}
        ${line('Text', p.textLabel)}
        ${line('Budget', p.budgetLabel)}
      </table>
      <p style="color:#64748b; font-size:13px; margin:0 0 6px; text-transform:uppercase;">Anything else</p>
      <p style="white-space:pre-wrap; color:#0b1d2d;">${escapeHtml(p.anythingElse || '—')}</p>
      <p style="color:#64748b; font-size:13px; margin:24px 0 6px; text-transform:uppercase;">JSON</p>
      <pre style="white-space:pre-wrap; word-break:break-word; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; font-size:12px; color:#0b1d2d;">${json}</pre>
    </div>
  </div>`;
}

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
    res.status(405).json({ ok: false, error: 'Method not allowed' });
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
  data = data || {};

  if (data.company_fax) {
    res.status(200).json({ ok: true });
    return;
  }

  const problem = validate(data);
  if (problem) {
    res.status(400).json({ ok: false, error: problem });
    return;
  }

  const brief = buildBrief(data);

  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email for website brief:', {
      business: brief.business.name,
      email: brief.business.email,
    });
    res.status(200).json({ ok: true, emailed: false, reason: 'email_not_configured' });
    return;
  }

  try {
    await sendEmail({
      to: OWNER_EMAIL,
      subject: SUBJECT,
      html: briefEmailHtml(brief),
      replyTo: brief.business.email,
    });
  } catch (err) {
    console.error('Failed to send website brief:', err);
    res.status(502).json({
      ok: false,
      emailed: false,
      error: 'We could not send the brief. Email hello@5280content.com.',
    });
    return;
  }

  res.status(200).json({ ok: true, emailed: true });
};
