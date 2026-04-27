# Brand Design SEO Engine

Internal SEO workbench for Brand Design Co. — keyword research, rank tracking, and AI-powered article generation. Built to be deployed on Vercel + Neon Postgres and used by the team via email/password sign-in.

## Features

- **Companies** — add clients with full StoryBrand BrandScript context
- **Keywords** — four research modes:
  1. AI Suggest by industry (Claude)
  2. AI Deep-research a seed keyword (Claude)
  3. **GSC Opportunity Miner** — pulls real Search Console queries and groups them into striking-distance, low-CTR, untapped, and rising buckets
  4. Saved keywords with mark-as-targeted
- **Rankings** — live Google Search Console data (clicks, impressions, CTR, position)
- **Articles** — StoryBrand quiz → full SEO article (markdown + HTML + meta description + SEO score)
- **Dashboard** — aggregate stats and recent activity

## Stack

- Vite + React 18 + TypeScript + Wouter + TanStack Query + shadcn/ui + Tailwind
- Hono on Vercel serverless `/api/*` routes
- Neon Postgres + Drizzle ORM
- Google Gemini (`gemini-2.5-flash` for keywords, `gemini-2.5-pro` for articles) with structured JSON output
- Google Search Console via shared service account

## Local development

### Prerequisites

- Node 20+ and pnpm
- A Neon Postgres database
- A Google Gemini API key (free at https://aistudio.google.com/apikey)
- A Google Cloud service account with Search Console API enabled

### Setup

```bash
pnpm install
cp .env.example .env
# fill in DATABASE_URL, GEMINI_API_KEY, AUTH_SECRET, GOOGLE_SA_KEY_B64
pnpm db:generate          # generates SQL migration files
pnpm db:migrate           # applies migrations to Neon
pnpm add-user you@branddesignco.com   # provision your first team member
```

Then run two terminals:

```bash
pnpm dev:server   # API on http://localhost:3001
pnpm dev          # web on http://localhost:5173 (proxies /api → :3001)
```

### Provisioning team members

There is no public sign-up. Add team members from the CLI:

```bash
pnpm add-user teammate@branddesignco.com "Their Name"
# prompts for password
```

Re-running with an existing email resets the password.

## Google Search Console setup

1. Create a service account in Google Cloud, enable the **Search Console API**, and download the JSON key
2. Base64-encode the JSON key: `base64 -i service-account.json | pbcopy` (macOS) and set as `GOOGLE_SA_KEY_B64`
3. In Search Console, **add the service account email** (looks like `xxx@yyy.iam.gserviceaccount.com`) as a **Restricted user** on every property the team needs to query
4. Use the property's preferred form when fetching: `branddesignco.com` (auto-resolves), or explicitly `sc-domain:branddesignco.com`, or `https://www.branddesignco.com/`

## Deploying to Vercel

1. Push this repo to GitHub
2. Import into Vercel
3. Set env vars in Vercel project settings: `DATABASE_URL`, `GEMINI_API_KEY`, `AUTH_SECRET` (32-byte hex), `GOOGLE_SA_KEY_B64`
4. Deploy. Vercel detects Vite + serverless `/api/*`
5. Run migrations once locally with the production `DATABASE_URL`: `DATABASE_URL=... pnpm db:migrate`
6. Provision users via `DATABASE_URL=... pnpm add-user ...`

The team accesses the deployment URL and signs in.

## Architecture

```
src/                React SPA (Vite)
api/[[...path]].ts  single Hono handler — Vercel routes all /api/* here
server/             Hono app + db client + Google Gemini + GSC libs
server/db/          Drizzle schema + migrations
scripts/            CLI utilities (add-user)
```

All `/api/*` routes (except `/api/auth/login` and `/api/auth/logout`) require an authenticated session. Sessions are HttpOnly cookies, 30-day expiry, server-side session table.
