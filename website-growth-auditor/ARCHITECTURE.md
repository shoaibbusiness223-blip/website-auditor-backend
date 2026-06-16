# Website Growth Auditor — Backend Architecture
> Production-ready Node.js + TypeScript + Supabase + Gemini AI

---

## Why Google Gemini (Free)?

| Feature | Gemini 1.5 Flash (Free) | OpenAI GPT-4o |
|---|---|---|
| Cost | **$0** | ~$5–15 per 1,000 audits |
| Rate limit | 15 req/min, 1,500/day | Paid only |
| Quality | Excellent for structured JSON | Excellent |
| JSON output | ✅ Reliable | ✅ Reliable |
| Get API key | aistudio.google.com | platform.openai.com |

**Free tier is plenty for development + early users. Upgrade to paid Gemini tier when you scale.**

---

## Folder Structure

```
website-growth-auditor/
├── src/
│   ├── config/
│   │   └── index.ts            ← All env vars + app config
│   ├── controllers/
│   │   ├── auth.controller.ts  ← Signup, login, /me
│   │   └── audit.controller.ts ← Run audit, get audit, list audits
│   ├── db/
│   │   ├── supabase.ts         ← Admin + anon Supabase clients
│   │   └── schema.sql          ← Full Supabase schema (run once)
│   ├── middleware/
│   │   ├── auth.ts             ← JWT verification via Supabase
│   │   ├── requestLogger.ts    ← HTTP request logging
│   │   └── errorHandler.ts     ← Global error + 404 handler
│   ├── routes/
│   │   ├── auth.routes.ts      ← /api/auth/*
│   │   └── audit.routes.ts     ← /api/audit/*
│   ├── services/
│   │   ├── auth.service.ts     ← Supabase auth logic
│   │   ├── scraper.service.ts  ← HTML fetching + parsing
│   │   ├── gemini.service.ts   ← Gemini AI analysis
│   │   └── audit.service.ts    ← Audit orchestration
│   ├── types/
│   │   └── index.ts            ← All TypeScript interfaces
│   ├── utils/
│   │   ├── logger.ts           ← Winston logger
│   │   ├── response.ts         ← sendSuccess / sendError helpers
│   │   └── ssrfGuard.ts        ← URL + SSRF validation
│   ├── validators/
│   │   └── index.ts            ← express-validator rules
│   ├── app.ts                  ← Express app setup
│   └── index.ts                ← Server entrypoint
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## API Reference

### Auth Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Get session token |
| GET | `/api/auth/me` | Yes | Get current user |

### Audit Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/audit` | Yes | Run a new audit |
| GET | `/api/audit` | Yes | List user's audits |
| GET | `/api/audit/:id` | Yes | Get single audit |

---

### POST /api/audit — Request

```json
{
  "url": "https://example.com"
}
```

### POST /api/audit — Response

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "website_url": "https://example.com",
    "status": "completed",
    "seo_score": 72,
    "conversion_score": 58,
    "trust_score": 80,
    "copywriting_score": 65,
    "overall_score": 69,
    "report_json": {
      "summary": "...",
      "issues": [
        {
          "severity": "critical",
          "category": "seo",
          "title": "Missing H1 tag",
          "description": "No H1 found. Search engines rely on H1 for topic understanding."
        }
      ],
      "recommendations": [
        {
          "priority": "high",
          "category": "seo",
          "title": "Add a descriptive H1 tag",
          "detail": "Add one H1 per page that includes your primary keyword.",
          "estimatedImpact": "10-15% improvement in SEO score"
        }
      ],
      "action_plan": [
        { "day": "Day 1", "task": "Audit all pages for missing H1 tags", "category": "seo" },
        { "day": "Day 2", "task": "Rewrite meta descriptions to include CTAs", "category": "copywriting" }
      ]
    },
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

---

## Database Schema

```sql
-- Two tables: public.users + public.audits
-- Full schema in: src/db/schema.sql
-- Run it in Supabase SQL Editor once

public.users
  id            UUID (FK to auth.users)
  email         TEXT
  full_name     TEXT
  plan          TEXT  (free | pro | enterprise)
  audit_count   INTEGER
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ

public.audits
  id                UUID
  user_id           UUID (FK to users)
  website_url       TEXT
  status            TEXT  (pending | processing | completed | failed)
  seo_score         SMALLINT
  conversion_score  SMALLINT
  trust_score       SMALLINT
  copywriting_score SMALLINT
  overall_score     SMALLINT
  report_json       JSONB
  scraped_data      JSONB
  error_message     TEXT
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ
```

---

## Security Architecture

```
Request
  │
  ├─ Helmet        → Secure HTTP headers (XSS, MIME, HSTS, CSP)
  ├─ CORS          → Whitelist only your frontend origin
  ├─ Rate Limiter  → 100 req/15min global, 10 audits/15min
  ├─ Body Parser   → Max 10kb JSON — blocks huge payloads
  ├─ Validator     → express-validator on all inputs
  ├─ Auth Guard    → Supabase JWT validation on protected routes
  ├─ SSRF Guard    → URL check → DNS resolution → private IP block
  └─ Axios Fetch   → 10s timeout + 5MB max response size
```

### SSRF Protection Flow

```
User URL → parse() → protocol whitelist (http/https only)
         → hostname blocklist (localhost, metadata IPs)
         → direct IP check (private range block)
         → DNS resolve → check all resolved IPs → private range block
         → SAFE ✅ → scrape
```

---

## 5-Day Build Roadmap

### ✅ Day 1 — Foundation (Today's code)
**Goal:** Running server with config, types, logging, database

Tasks:
- [ ] `npm install` all dependencies
- [ ] Copy `.env.example` to `.env` and fill in Supabase + Gemini keys
- [ ] Run `schema.sql` in Supabase SQL Editor
- [ ] `npm run dev` → verify server starts on port 8080
- [ ] Test: `GET /health` returns `{ status: "ok" }`

Files built today:
- `src/index.ts` + `src/app.ts`
- `src/config/`, `src/types/`, `src/utils/`
- `src/db/supabase.ts` + `schema.sql`
- All middleware

---

### 📋 Day 2 — Authentication
**Goal:** Working signup, login, protected routes

Tasks:
- [ ] Test `POST /api/auth/signup` with Postman
- [ ] Test `POST /api/auth/login` → get JWT token
- [ ] Test `GET /api/auth/me` with Bearer token
- [ ] Test with invalid/expired token → should get 401
- [ ] Verify user appears in Supabase Dashboard → Auth → Users
- [ ] Verify row appears in `public.users` table (trigger fires)

Checklist:
```bash
# Signup
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234","full_name":"Test User"}'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234"}'

# Me (use access_token from login response)
curl http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

### 🔍 Day 3 — Scraper + SSRF Guard
**Goal:** Website scraping works safely

Tasks:
- [ ] Test `scrapeWebsite()` directly with a real URL
- [ ] Verify SSRF guard blocks: `localhost`, `127.0.0.1`, `192.168.x.x`
- [ ] Verify scraper extracts: title, meta, H1, H2, CTAs, images
- [ ] Test with a complex site (e.g., stripe.com)
- [ ] Confirm 10s timeout triggers on slow sites
- [ ] Log output structured and readable

Write a quick test script:
```typescript
// test-scraper.ts
import { scrapeWebsite } from './src/services/scraper.service';
scrapeWebsite('https://stripe.com').then(console.log).catch(console.error);
```

---

### 🤖 Day 4 — Gemini AI + Audit Pipeline
**Goal:** Full audit runs end-to-end and saves to DB

Tasks:
- [ ] Get Gemini API key at aistudio.google.com
- [ ] Add `GEMINI_API_KEY` to `.env`
- [ ] Test `analyzeWithGemini()` directly with scraped content
- [ ] Test full `POST /api/audit` with real URL
- [ ] Verify audit row saved in Supabase `audits` table
- [ ] Verify `status` transitions: pending → processing → completed
- [ ] Test `GET /api/audit/:id` returns full report
- [ ] Test error case: invalid URL, private IP → proper error response

Gemini free limits: 15 req/min, 1,500/day
Each audit = 1 Gemini call → you have 1,500 free audits per day.

---

### 🚀 Day 5 — Polish + Vercel Deploy
**Goal:** Production deploy, CI-ready

Tasks:
- [ ] Add `vercel.json` config for Express on Vercel:

```json
{
  "version": 2,
  "builds": [{ "src": "src/index.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "src/index.ts" }]
}
```

- [ ] Set all env vars in Vercel Dashboard
- [ ] Set `NODE_ENV=production`, `CORS_ORIGIN=https://yourdomain.com`
- [ ] Deploy: `vercel --prod`
- [ ] Test all endpoints on production URL
- [ ] Set up Supabase connection pooler for production
- [ ] Add error monitoring (free: Sentry free tier)

Production checklist:
- [ ] `.env` not committed to git
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only in server env vars
- [ ] Rate limits appropriate for your plan
- [ ] Logs visible in Vercel Functions tab

---

## Environment Variables Reference

```bash
# Required — get from supabase.com > Project Settings > API
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # NEVER expose to frontend
SUPABASE_JWT_SECRET=your-jwt-secret

# Required — get from aistudio.google.com/app/apikey (free)
GEMINI_API_KEY=AIza...

# App config
NODE_ENV=development
PORT=8080
CORS_ORIGIN=http://localhost:3000

# Tunable
RATE_LIMIT_WINDOW_MS=900000     # 15 minutes
RATE_LIMIT_MAX=100              # Global requests per window
AUDIT_RATE_LIMIT_MAX=10         # Audit-specific per window
FETCH_TIMEOUT_MS=10000          # 10s scrape timeout
MAX_RESPONSE_SIZE_BYTES=5242880 # 5MB max page size
```

---

## Scores Explained

| Score | Weight | What it measures |
|---|---|---|
| SEO | 30% | Title, meta desc, H1/H2, SSL, alt tags, word count |
| Conversion | 30% | CTAs, value proposition, clear headline |
| Trust | 20% | HTTPS, content depth, professionalism |
| Copywriting | 20% | Headline quality, CTA text, meta copy |
| **Overall** | — | Weighted average of above |

---

## Scaling Notes (when you're ready)

1. **Async audits**: Move `runAudit()` to a background job queue (BullMQ + Redis) so POST /audit returns immediately and audit runs async
2. **Caching**: Cache audits for same URL within 24h (save Gemini quota)
3. **Pagination cursor**: Replace limit/offset with cursor-based pagination for audits list
4. **Webhook**: Notify frontend when async audit completes
5. **Supabase Edge Functions**: Move scraper there for geo-distributed fetching
