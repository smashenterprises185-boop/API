/**
 * Centralized Contact & Inquiry Mailer API
 * ------------------------------------------------------------
 * A small, self-contained Express microservice that accepts
 * contact-form submissions, validates & sanitizes them, applies
 * rate limiting, and dispatches a styled HTML email via
 * Nodemailer (or a console "mock" transport for local demos).
 * ------------------------------------------------------------
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const validator = require('validator');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ────────────────────────────────────────────────────────────
// Core middleware
// ────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '10kb' })); // small limit — this API only needs a contact payload
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Serve the demo frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

// ────────────────────────────────────────────────────────────
// CORS configuration
// ────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser tools (curl/Postman) with no origin header,
    // and any origin explicitly whitelisted in ALLOWED_ORIGINS.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));

// ────────────────────────────────────────────────────────────
// Rate limiting — protects /api/contact from spam/abuse
// ────────────────────────────────────────────────────────────
const contactLimiter = rateLimit({
  windowMs: (Number(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 5,
  standardHeaders: true, // return RateLimit-* headers
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'TooManyRequests',
      message: 'Too many submissions from this IP. Please try again later.',
    });
  },
});

// ────────────────────────────────────────────────────────────
// Mail transporter setup
// ────────────────────────────────────────────────────────────
const useMockMailer = String(process.env.MOCK_MAILER).toLowerCase() === 'true';

function buildTransporter() {
  if (useMockMailer) {
    // "jsonTransport" doesn't send anything over the network — it just
    // resolves with the message it *would* have sent. Perfect for a
    // portfolio demo with no real SMTP credentials configured.
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const transporter = buildTransporter();

// ────────────────────────────────────────────────────────────
// Validation & sanitization helpers
// ────────────────────────────────────────────────────────────
const FIELD_LIMITS = {
  name: { min: 2, max: 100 },
  email: { min: 5, max: 254 },
  subject: { min: 3, max: 150 },
  message: { min: 10, max: 2000 },
};

/**
 * Strips tags/markup and trims whitespace so nothing HTML-ish
 * (or otherwise dangerous) makes it into the outgoing email or
 * any downstream storage.
 */
function sanitize(value) {
  if (typeof value !== 'string') return '';
  const stripped = validator.stripLow(validator.escape(value.trim()));
  return stripped;
}

function validateContactPayload(body) {
  const errors = [];
  const raw = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    subject: typeof body.subject === 'string' ? body.subject.trim() : '',
    message: typeof body.message === 'string' ? body.message.trim() : '',
    // Honeypot field — real users never fill this in. Bots often do.
    website: typeof body.website === 'string' ? body.website.trim() : '',
  };

  if (raw.website) {
    errors.push({ field: 'website', message: 'Spam detected.' });
    return { errors, data: null };
  }

  if (!raw.name || raw.name.length < FIELD_LIMITS.name.min || raw.name.length > FIELD_LIMITS.name.max) {
    errors.push({
      field: 'name',
      message: `Name must be between ${FIELD_LIMITS.name.min} and ${FIELD_LIMITS.name.max} characters.`,
    });
  }

  if (!raw.email || !validator.isEmail(raw.email) || raw.email.length > FIELD_LIMITS.email.max) {
    errors.push({ field: 'email', message: 'A valid email address is required.' });
  }

  if (
    !raw.subject ||
    raw.subject.length < FIELD_LIMITS.subject.min ||
    raw.subject.length > FIELD_LIMITS.subject.max
  ) {
    errors.push({
      field: 'subject',
      message: `Subject must be between ${FIELD_LIMITS.subject.min} and ${FIELD_LIMITS.subject.max} characters.`,
    });
  }

  if (
    !raw.message ||
    raw.message.length < FIELD_LIMITS.message.min ||
    raw.message.length > FIELD_LIMITS.message.max
  ) {
    errors.push({
      field: 'message',
      message: `Message must be between ${FIELD_LIMITS.message.min} and ${FIELD_LIMITS.message.max} characters.`,
    });
  }

  if (errors.length > 0) {
    return { errors, data: null };
  }

  return {
    errors: null,
    data: {
      name: sanitize(raw.name),
      email: validator.normalizeEmail(raw.email) || sanitize(raw.email),
      subject: sanitize(raw.subject),
      message: sanitize(raw.message),
    },
  };
}

// ────────────────────────────────────────────────────────────
// Email template
// ────────────────────────────────────────────────────────────
function buildInquiryEmailHtml({ name, email, subject, message }) {
  const submittedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#f4f5f7; padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;">New Contact Inquiry</h1>
        <p style="margin:4px 0 0;color:#e0e7ff;font-size:13px;">Received ${submittedAt}</p>
      </div>
      <div style="padding:24px 32px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1f2937;">
          <tr>
            <td style="padding:8px 0;width:110px;color:#6b7280;">Name</td>
            <td style="padding:8px 0;font-weight:600;">${name}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Email</td>
            <td style="padding:8px 0;font-weight:600;">${email}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;">Subject</td>
            <td style="padding:8px 0;font-weight:600;">${subject}</td>
          </tr>
        </table>
        <div style="margin-top:16px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #eef0f2;">
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
        </div>
      </div>
      <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #eef0f2;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">Sent automatically by the Centralized Contact & Inquiry Mailer API.</p>
      </div>
    </div>
  </div>`;
}

// ────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────

// Health check — polled by the frontend's API status badge
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'online',
    uptimeSeconds: Math.floor(process.uptime()),
    mailer: useMockMailer ? 'mock' : 'smtp',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { errors, data } = validateContactPayload(req.body || {});

    if (errors) {
      return res.status(400).json({
        success: false,
        error: 'ValidationError',
        message: 'One or more fields failed validation.',
        details: errors,
      });
    }

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME || 'Contact Mailer'}" <${
        process.env.SMTP_USER || 'no-reply@example.com'
      }>`,
      to: process.env.RECEIVING_EMAIL || process.env.SMTP_USER || 'no-reply@example.com',
      replyTo: data.email,
      subject: `[Contact Form] ${data.subject}`,
      html: buildInquiryEmailHtml(data),
    };

    const info = await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you soon.',
      mailer: useMockMailer ? 'mock' : 'smtp',
      messageId: info.messageId || null,
    });
  } catch (err) {
    console.error('Error sending contact email:', err);
    return res.status(500).json({
      success: false,
      error: 'InternalServerError',
      message: 'Something went wrong while sending your message. Please try again later.',
    });
  }
});

// Fallback 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'NotFound', message: 'API route not found.' });
});

// Generic error handler (e.g. CORS rejections, malformed JSON)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err.message);
  const status = err.message === 'Not allowed by CORS policy' ? 403 : 400;
  res.status(status).json({
    success: false,
    error: status === 403 ? 'CORSError' : 'BadRequest',
    message: err.message || 'Invalid request.',
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Contact & Inquiry Mailer API running on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
  console.log(`   Mailer mode: ${useMockMailer ? 'MOCK (console output only)' : 'SMTP'}`);
});

module.exports = app;