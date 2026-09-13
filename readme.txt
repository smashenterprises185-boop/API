# Centralized Contact & Inquiry Mailer API

A small full-stack portfolio project: an Express microservice that validates, rate-limits,
and emails contact-form submissions, plus a vanilla-JS client to test and showcase it.

## Setup

```bash
npm install
cp .env.example .env
npm start        # or: npm run dev (with nodemon)
```

Open `http://localhost:5000` — the Express server also serves the `public/` frontend, so
no separate dev server is needed.

By default `MOCK_MAILER=true` in `.env.example`, so submissions are logged to the console
instead of sent over real SMTP — handy for a portfolio demo. Set `MOCK_MAILER=false` and
fill in the `SMTP_*` values (e.g. a Gmail App Password) to send real emails.

## Endpoints

| Method | Path            | Description                              |
|--------|-----------------|-------------------------------------------|
| GET    | `/api/health`   | Health check used by the status badge     |
| POST   | `/api/contact`  | Submit a contact inquiry (rate-limited)   |

### POST /api/contact

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "subject": "Project inquiry",
  "message": "Hi, I'd like to talk about..."
}
```

Responses: `200` success, `400` validation error (with a `details` array), `429` rate
limited, `500` server error.

## Notes

- Rate limit: 5 requests / 15 minutes per IP (configurable via `.env`).
- CORS is restricted to `ALLOWED_ORIGINS` (comma-separated) — leave empty to allow all.
- A hidden honeypot field (`website`) provides basic bot filtering on top of the API's own validation.