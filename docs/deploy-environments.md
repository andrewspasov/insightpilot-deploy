# Live and playground: what each service needs

Two copies of everything run online:

| | Live | Playground |
|---|---|---|
| Git branch (`insightpilot-deploy`) | `main` | `staging` |
| Backend | current Render web service | second Render web service |
| Database | current Render Postgres | **separate** Render Postgres (test data only) |
| Website | Cloudflare Pages, production | Cloudflare Pages preview for `staging` |
| Phone | "InsightPilot" (`npm run ipa:live`) | "InsightPilot Beta" (`npm run ipa:beta`) |

Never point the playground at the live database.

## Backend (Render → service → Environment)

The backend accepts either the old names the live service already uses
(`DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`) or the
`DJANGO_*` names below. Leave the live service's existing names as they are.

### Core

| Variable | Live | Playground |
|---|---|---|
| `DJANGO_DEBUG` (or `DEBUG`) | `false` | `false` |
| `DJANGO_SECRET_KEY` (or `SECRET_KEY`) | keep current | new random value (different from live) |
| `DJANGO_ALLOWED_HOSTS` (or `ALLOWED_HOSTS`) | `<live>.onrender.com` | `<playground>.onrender.com` |
| `FRONTEND_BASE_URL` | live website URL | playground website URL |
| `CORS_ALLOWED_ORIGINS` | extra website URLs, comma-separated (the `FRONTEND_BASE_URL` is added automatically) | same |
| `WAGTAILADMIN_BASE_URL` | `https://<live>.onrender.com` | `https://<playground>.onrender.com` |
| `DB_ENGINE` | `postgres` | `postgres` |
| `POSTGRES_HOST` / `_PORT` / `_DB` / `_USER` / `_PASSWORD` | live database | playground database |

### AI coach

| Variable | Value |
|---|---|
| `INSIGHT_AI_PROVIDER` | `openai` |
| `INSIGHT_AI_OPENAI_API_KEY` | your key (same on both, or a separate key for the playground to see its cost) |
| `INSIGHT_AI_OPENAI_MODEL` | `gpt-5.4-nano` |
| `INSIGHT_AI_GEMINI_API_KEY` / `INSIGHT_AI_MODEL` | only if switching to Gemini (`gemini-2.5-flash-lite`) |
| `INSIGHT_AI_ALLOWED_EMAILS` | who may use the AI (comma-separated emails) |
| `INSIGHT_AI_MONTHLY_MESSAGE_LIMIT` | `100` |
| `INSIGHT_AI_MONTHLY_TOKEN_LIMIT` | `1000000` |
| `INSIGHT_AI_MAX_OUTPUT_TOKENS` | `700` |
| `INSIGHT_AI_TIMEOUT_SECONDS` | `30` |

### Food data and photos

| Variable | Value |
|---|---|
| `USDA_FOODDATA_CENTRAL_API_KEY` | same key on both |
| `UNSPLASH_ACCESS_KEY` | same key; apply for production access (demo = 50 requests/hour) |

### Email (daily report, password reset)

Use Brevo or Resend, not a personal Gmail.

| Variable | Value |
|---|---|
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | from the email provider |
| `EMAIL_USE_TLS` | `true` (port 587) |
| `DEFAULT_FROM_EMAIL` | e.g. `InsightPilot <no-reply@yourdomain>` |

### Payments (Stripe)

| Variable | Live | Playground |
|---|---|---|
| `STRIPE_SECRET_KEY` | test key until live payments are activated | test key |
| `STRIPE_WEBHOOK_SECRET` | from the webhook pointing at the live backend | from a second webhook pointing at the playground |
| `STRIPE_GRACE_DAYS` | `7` | `7` |

Prices live in the database (admin → Access passes), so each environment
needs its own Stripe price ids set there.

### Sign-in with Google / Facebook (only if used)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`,
`FRONTEND_OAUTH_REDIRECT_PATH` (`/oauth/callback`). The redirect URIs differ
per environment and must also be added in the Google/Facebook consoles.

### Other (copy from live if set there)

`INSIGHTPILOT_INTERNAL_TOKEN`, `YOUTUBE_API_KEY`, `PEXELS_API_KEY`,
`MERCADOLIBRE_*`.

## Scheduled job

Render Cron Job, hourly (`0 * * * *`), same repo/branch and environment
variables as its backend:

```
cd backend && python manage.py send_daily_reports
```

The playground can skip it, or run it to test the emails.

## Website (Cloudflare Pages → Settings → Variables)

| Variable | Production | Preview (`staging`) |
|---|---|---|
| `VITE_API_URL` | `https://<live>.onrender.com/api` | `https://<playground>.onrender.com/api` |

## Phone

Set the two server addresses at the top of `mobile/app.config.js`
(`LIVE_API_URL`, `PLAYGROUND_API_URL`, without `/api`), then build:

```
cd mobile
npm run ipa:beta   # builds/InsightPilot-Beta.ipa
npm run ipa:live   # builds/InsightPilot.ipa
```

AirDrop the `.ipa` to the iPhone and open it with SideStore.
