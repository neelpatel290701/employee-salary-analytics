# 10 — Deployment Plan

> **Purpose of this document.** This document is the bridge from "we have a complete plan" to "we know exactly how this ships." It defines the production topology, the platforms we will use, the inventory of every environment variable, the build pipelines, the release process (including how database migrations are applied safely), the secrets-handling rules, the first-deploy checklist, and the observability and cost footprint we are accepting in v1. When the implementation phase concludes, the operator following this document should be able to take the code from a green test suite to a working URL the reviewer can click — with no improvisation.

---

## 1. Production topology — the one-screen view

```mermaid
flowchart LR
    User["HR Manager<br/>(browser)"]

    subgraph VercelEdge["Vercel — global CDN"]
        SPA["React SPA<br/>(Vite static build)"]
    end

    subgraph RailwayProd["Railway"]
        ExpressService["Express service<br/>(Node 20)"]
        MySQLPlugin[("MySQL 8 plugin")]
    end

    User -->|"HTTPS"| SPA
    SPA -->|"HTTPS<br/>VITE_API_URL"| ExpressService
    ExpressService -->|"DATABASE_URL"| MySQLPlugin
```

Three deployed pieces:

1. The **React SPA** as static assets on Vercel.
2. The **Express service** as a single container on Railway.
3. The **MySQL 8 instance** as a Railway-managed plugin on the same project.

No CDNs, gateways, load balancers, message buses, or auxiliary services. The deployment is as small as it can be while still being honest about how a real internal HR tool would run.

---

## 2. Why Railway + Vercel

The choice was settled in [`03-architecture.md`](03-architecture.md) §5 and recorded in [`08-tradeoffs.md`](08-tradeoffs.md). The condensed reasoning:

| Platform | Responsibility | Why it |
|---|---|---|
| **Vercel** | Static SPA hosting, global edge CDN, automatic TLS, branch previews | The canonical hosting for a Vite-built static SPA. Free tier covers an assessment; zero config beyond `vercel.json`. |
| **Railway** | Always-on container for Express, managed MySQL, environment-variable management, `release` step support | A managed PaaS that runs a Dockerfile-less Node service and a MySQL plugin in the same project. Pricing fits an assessment; resource limits fit the workload. |

We are not deploying to a single platform (e.g. all-Vercel with serverless functions) because:

- Serverless functions reset connections per invocation; Prisma's pool would be defeated by cold starts and we would need an external connection pooler.
- The seed script, which must run *on the production database*, is a long-lived Node process that does not fit a serverless duration budget.
- Splitting frontend and backend onto their natural homes makes the deployment honest about how an internal tool of this shape is operated in real life.

---

## 3. The environment-variable inventory

Every variable, where it lives, who sets it, and what happens if it is missing. The full set is parsed by a single `config.ts` module ([`03-architecture.md`](03-architecture.md) §6.4); a missing or malformed value is a startup failure with a clear error message.

### 3.1 Backend (Railway service)

| Variable | Required? | Where set in prod | Where set in dev | Purpose |
|---|---|---|---|---|
| `NODE_ENV` | yes | Railway injects | `.env` (`development`) | Express behavior, `pino` log format, stack-trace exposure. |
| `PORT` | yes | Railway injects | `.env` (`3000`) | Express listening port. Railway provides this; never hard-code. |
| `DATABASE_URL` | yes | Railway plugin link | `.env` (`mysql://app:app@localhost:3306/employee_analytics`) | Prisma connection string. Includes credentials. |
| `LOG_LEVEL` | no | Railway env (`info`) | `.env` (`debug`) | `pino` level. Defaults to `info`. |
| `ALLOWED_ORIGINS` | yes | Railway env (Vercel prod URL) | `.env` (`http://localhost:5173`) | Comma-separated origin allow-list for CORS. |
| `RATE_LIMIT_ENABLED` | no | not set (off in v1) | not set | Reserved for the future per `05-api-design.md` §8. |

### 3.2 Frontend (Vercel project)

| Variable | Required? | Where set in prod | Where set in dev | Purpose |
|---|---|---|---|---|
| `VITE_API_URL` | yes | Vercel env (Railway prod URL) | `.env.local` (`http://localhost:3000` — but unused because of the Vite dev proxy) | Build-time-injected base URL for the API client. Read once at build, frozen into the bundle. |

### 3.3 Test (local + CI)

| Variable | Required? | Set where | Purpose |
|---|---|---|---|
| `DATABASE_URL` (test) | yes | `backend/.env.test` (gitignored) | Points at the `employee_analytics_test` database in the local Docker Compose MySQL. Never points at a production database. |

### 3.4 The rules

- **No secrets are committed.** Every variable above lives in `.env` (local), `.env.test` (local-CI), Railway env (prod backend), or Vercel env (prod frontend). The repository contains an `.env.example` that documents the *names* with placeholder values.
- **Production secrets are rotated** when an engineer leaves or when a leak is suspected. The rotation procedure for each is in §10.
- **The frontend cannot read backend secrets.** `VITE_*` variables are baked into the public bundle; anything secret must not have a `VITE_` prefix. The only frontend variable is `VITE_API_URL`, which is a public URL.
- **`config.ts` is the only consumer.** No file in `src/` reads `process.env` directly. This guarantees a single point of truth and a single point of failure for misconfiguration.

---

## 4. Backend deployment — Railway

### 4.1 The service shape

- **Runtime:** Node 20 (Railway's `nodejs` builder).
- **Build command:** `npm ci --workspaces && npm --workspace backend run build`.
- **Start command:** `npm --workspace backend run start`.
- **Release command (run before the new container takes traffic):** `npm --workspace backend run prisma:migrate:deploy`.
- **Healthcheck:** Railway hits `GET /api/health` every few seconds; the service is marked unhealthy and rolled back if the probe fails.

### 4.2 The release order matters

A production-quality release runs migrations *before* the new code takes traffic, never *after*. Otherwise: a request to a new endpoint can arrive before the schema it needs exists.

```
1. Push to main
2. Railway builds the new image
3. Release step:  npm run prisma:migrate:deploy
4. Healthcheck the new image
5. Switch traffic
6. Drain old image
```

Railway supports this sequence via the `release` command. If step 3 fails, step 5 does not happen — old traffic continues serving on the old code.

### 4.3 What `prisma migrate deploy` actually does

It applies any pending migration files (the ones we generated with `prisma migrate dev` during implementation and checked in to `prisma/migrations/`). It is **idempotent** — running it twice has no effect the second time. It never generates new migration files in production; it only applies pre-existing ones.

This is the discipline. We *never* `prisma db push` in production; we *never* run `prisma migrate dev` in production. Both can mutate the schema in ways that are not reflected in the migrations directory and are therefore not reviewable.

### 4.4 Connection pool

Prisma's pool is set to **5 connections** by the `connection_limit` query parameter on the `DATABASE_URL` (e.g. `mysql://...?connection_limit=5`). The default is too aggressive for a small managed MySQL instance.

### 4.5 Process model

Railway runs a single instance of the Express service in v1. The service is stateless; the only state is in MySQL.

If we ever need to scale horizontally:

- The service is already stateless and can be scaled to N instances without code changes.
- Sticky sessions are not required.
- Prisma's per-instance pool of 5 means N instances ≤ floor(MySQL's max-connections / 5). For the Railway free tier MySQL we would not exceed ~3 backend instances. Documented as a future concern in [`07-performance-plan.md`](07-performance-plan.md) §9.

### 4.6 Logging in production

- `pino` emits JSON to stdout. Railway's log viewer is structured-JSON-aware.
- Log level defaults to `info`. Application errors are at `error` and include the `requestId`.
- We do **not** log salary values or full employee records at `info`. Only IDs and the operation. Documented in [`03-architecture.md`](03-architecture.md) §6.5.

---

## 5. Frontend deployment — Vercel

### 5.1 The project shape

- **Framework preset:** "Vite" (Vercel auto-detects from the project).
- **Build command:** `npm ci --workspaces && npm --workspace frontend run build`.
- **Output directory:** `frontend/dist`.
- **Install command:** the default Vercel-issued `npm ci` over the monorepo.
- **Node version:** 20.

### 5.2 The build reads one variable

`VITE_API_URL` is read **at build time** and frozen into the bundle. There is no runtime config in the SPA — once built, the API URL is immutable until the next deploy. This is a feature: the deploy is the unit of configuration change.

### 5.3 SPA routing

Vercel's default behavior is to serve `404`s for unknown paths. For a SPA, every path must serve `index.html` and let the client-side router decide. `vercel.json` will contain:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 5.4 Preview deployments

Every push to a non-`main` branch yields a unique Vercel preview URL. We will *not* configure preview branches to point at a separate backend; they will point at the same production Railway URL. This is acceptable because there is no auth and no destructive operation triggered by a preview deploy.

If we needed pristine preview-environment behavior, we would point preview builds at a staging Railway service. That is documented as a future concern, not built.

### 5.5 Caching

Vercel handles static-asset caching automatically. The Vite build emits content-hashed filenames, so cache invalidation is automatic on deploy.

---

## 6. Database — Railway MySQL plugin

### 6.1 What we get for free

- A managed MySQL 8 instance reachable via `DATABASE_URL` (variable injected automatically once the plugin is attached to the service).
- Automated daily backups with point-in-time recovery (free tier retains them for a limited window — sufficient for an assessment).
- TLS by default.

### 6.2 What we configure

- `connection_limit=5` on the URL (see §4.4).
- No `pool_timeout` override — Prisma's default is fine.
- We do **not** open the MySQL port to the public internet. Railway's private network is the only access path; the service connects via the same private network.

### 6.3 What we do not configure (and why)

- Read replicas — premature at our scale.
- `binlog_format` / replication — no replication.
- Buffer pool sizing — Railway's default works.
- A second user with read-only privileges — single service, single user, no analytics tool to plug in.

### 6.4 First-time setup

The first deploy needs the schema applied. The release step does this automatically via `prisma migrate deploy`. We never run `prisma db push` against the production database — that bypasses the migrations directory and is irreversible from the project's point of view.

### 6.5 Seeding the production database

We do **not** seed production. The seed script's 10,000 fake employees belong in development and demo environments. The production deployment will be seeded by **one explicit demo run** for the reviewer:

```bash
DATABASE_URL=<railway-mysql-url> npm --workspace backend run seed -- --count=10000 --seed=42
```

This is a one-off command, executed by the operator (the candidate) from a local terminal pointing at the Railway database. It is recorded here for transparency.

---

## 7. Security posture

The brief does not ask for auth; we are not building auth (decision documented in [`08-tradeoffs.md`](08-tradeoffs.md) 7.1). That said, we do not leave production wide open. Concrete measures:

| Surface | Measure |
|---|---|
| TLS | Both Vercel and Railway terminate TLS automatically. No HTTP. |
| CORS | `ALLOWED_ORIGINS` env limits accepted origins to the Vercel production URL (and preview URLs if we wire them up). |
| Body size | Express body parser is capped at 1 MB. The largest legitimate payload (a create-employee body) is well under 1 KB. |
| Helmet | `helmet()` middleware adds standard hardening headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, etc.). |
| Error responses | Never include exception messages or stack frames ([`05-api-design.md`](05-api-design.md) §3.3). |
| Secrets | Never committed; lifecycle described in §3.4 and §10. |
| Log content | No salary values or full employee records at `info` level ([`03-architecture.md`](03-architecture.md) §6.5). |
| Rate limiting | Off in v1 (documented in [`05-api-design.md`](05-api-design.md) §8). The reviewer is a single trusted user; abuse risk is nil. |
| SQL injection | Prisma's parameterised queries. The only raw-SQL path is the seed script, where inputs are server-generated. The `sortBy` parameter is validated against a whitelist of column names ([`05-api-design.md`](05-api-design.md) §2.7). |

This is the *intended* posture for an internal assessment tool, not for a real internet-facing HR system. The real-system upgrades are in [`08-tradeoffs.md`](08-tradeoffs.md) §8.

---

## 8. The release process

The default release cadence is **push to `main`, deploy automatically**. Both Vercel and Railway are configured to track the `main` branch. There is no manual deploy step in v1.

### 8.1 The full sequence (per release)

```
1. PR merges to main
2. Railway:
   a. Build the new image  (npm ci, build, prisma generate)
   b. Run release step       (prisma migrate deploy)
   c. Healthcheck            (GET /api/health)
   d. Cut traffic over
   e. Drain old image
3. Vercel:
   a. Build the new SPA      (npm ci, vite build, VITE_API_URL frozen in)
   b. Deploy to edge
   c. Invalidate previous deploy aliases
4. Smoke test (manual, per §11)
```

### 8.2 Rollback

- **Vercel:** "Promote previous deployment" in the dashboard. Instant.
- **Railway:** "Roll back to previous deployment." Instant for the code; *migrations are not rolled back* because they are forward-only by policy ([`04-data-model.md`](04-data-model.md) §7). A roll-forward fix is the recovery path.
- **Database accident:** Restore from Railway's daily backup. Documented as the only path for accidental data loss.

The forward-only migrations policy means we plan migrations to be **expand-then-contract** when they would otherwise be destructive: a column rename is *add new* → *backfill* → *dual-write* → *read-only old* → *drop old*. This makes every step independently rollback-friendly even though we never write `down` migrations.

---

## 9. The first-deploy checklist

The literal sequence the operator follows the first time the project is deployed. Each step is verifiable.

```
[ ] 1.  Railway project created
[ ] 2.  MySQL plugin attached to the project
[ ] 3.  DATABASE_URL appears in the service's environment
[ ] 4.  Backend service connected to the GitHub repo (or `railway up`)
[ ] 5.  Environment variables set on the backend service:
        - NODE_ENV=production
        - LOG_LEVEL=info
        - ALLOWED_ORIGINS=<vercel-prod-url>
        - DATABASE_URL appended with ?connection_limit=5
[ ] 6.  Release command set: npm --workspace backend run prisma:migrate:deploy
[ ] 7.  Start command set:   npm --workspace backend run start
[ ] 8.  Healthcheck path set: /api/health
[ ] 9.  First deploy triggered; logs verified clean
[ ] 10. curl https://<railway-url>/api/health -> {"status":"ok"}
[ ] 11. Vercel project created from the same GitHub repo, root = frontend/
[ ] 12. VITE_API_URL set to the Railway URL
[ ] 13. vercel.json rewrite rule confirmed in the repo
[ ] 14. First Vercel deploy succeeds
[ ] 15. Open the Vercel URL: SPA loads
[ ] 16. Browser network tab: /api/employees returns 200 with empty data
[ ] 17. Seed the production DB (one-time):
        DATABASE_URL=<railway-private-or-public-url> \
          npm --workspace backend run seed -- --count=10000 --seed=42
[ ] 18. Refresh the SPA: employee list renders with 10k rows; pagination works
[ ] 19. Insights page renders with country stats; one country chosen, percentiles populated
[ ] 20. Manual smoke per §11 passes
[ ] 21. URLs (Vercel + Railway) recorded in the README's "Demo" section
```

If any line item fails, the operator pauses and resolves before proceeding. There is no "I'll fix it after" line item in this list.

---

## 10. Secrets handling and rotation

| Secret | Where it lives | When it must rotate | How |
|---|---|---|---|
| `DATABASE_URL` | Railway plugin (managed) | If suspected leak; if an engineer with access leaves | Regenerate the MySQL user password in Railway; redeploy. |
| Any Railway API tokens | Local CLI; not in repo | Quarterly; on suspected leak | Issue a new token; revoke the old. |
| Vercel deploy tokens | Local CLI; not in repo | Quarterly; on suspected leak | Issue a new token; revoke the old. |
| GitHub repo deploy keys | GitHub repo settings | On suspected leak | Issue a new key; revoke the old. |

What the operator must **never** do:

- Paste a `DATABASE_URL` into chat (including this one). The values in this doc are placeholders.
- Commit a `.env` file. The `.gitignore` excludes them; the operator does not override.
- Echo the `DATABASE_URL` from a CI log. The release-step output is checked once before going live.

---

## 11. The post-deploy smoke test

After the first deploy and after every subsequent release, the operator runs the following manual smoke. It takes about ninety seconds.

1. Open the Vercel URL. The SPA loads in under two seconds.
2. The Employees tab shows 10,000 rows total with pagination indicating the right total.
3. Apply a country filter (e.g. `US`). The list narrows; the result count updates correctly.
4. Apply a search term (e.g. a real surname from the seed). The list filters; the count is correct.
5. Click **Add Employee**, fill the form with deliberately invalid data (negative salary). The 422 field-level error is visible.
6. Fix the form, submit. The row appears in the list within a second. The total count increases by one.
7. Edit the newly-added row. The change persists on refresh.
8. Delete the newly-added row. The total count returns to 10,000.
9. Switch to the Insights tab. The summary numbers populate.
10. Drill into a specific country's stats. Min/max/avg/median/P25/P75 all show non-null values.
11. Outliers panel renders; clicking an outlier navigates to the employee record.

If any step fails, the deploy is **not** considered shipped. The fix lands in a follow-up commit before the URL is shared.

---

## 12. Reproducing the deployment locally

A reviewer who wants to run the deployment-equivalent stack on their own machine can do so by:

```bash
# 1. Boot MySQL
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install                  # at the monorepo root, actually
npm --workspace backend run prisma:migrate:deploy
npm --workspace backend run seed -- --count=10000 --seed=42
npm --workspace backend run dev

# 3. Frontend (in another shell)
cd frontend
cp .env.local.example .env.local
npm --workspace frontend run dev

# 4. Open http://localhost:5173
```

The README's "Running locally" section is the authoritative copy of these commands; this section exists to anchor the deployment doc to its local equivalent so the parity is visible.

---

## 13. Observability in production (v1)

We are deliberately small here:

| Capability | What we have | What we do not have (and where the upgrade is documented) |
|---|---|---|
| Request logs | `pino` JSON to stdout, viewed in the Railway dashboard. Each line carries `requestId`, `method`, `path`, `status`, `durationMs`. | Centralised log aggregation (Datadog, BetterStack). Future. |
| Error counts | Visible by filtering for `level: error` in the Railway logs. | Sentry / Honeybadger for grouped error reporting. Future. |
| Latency percentiles | Eyeballed from logs. | An APM (Datadog APM, OpenTelemetry traces + Tempo) — [`07-performance-plan.md`](07-performance-plan.md) §9. |
| Uptime | Railway healthcheck = the only signal. | An external uptime monitor (Pingdom, Better Uptime) — future. |
| Database insight | Railway dashboard's MySQL plugin metrics — connections, query rate. | Slow-query log, `performance_schema` deep dives — future. |

This level of observability is appropriate for an internal assessment tool. The upgrade path is in [`08-tradeoffs.md`](08-tradeoffs.md) §8.

---

## 14. The cost footprint

The deployment is sized to fit free / hobby tiers:

| Resource | Tier | Notes |
|---|---|---|
| Vercel | Hobby | Free, fits a non-commercial assessment submission. |
| Railway | Hobby | $5/mo of usage credit covers a small Express service + a small MySQL plugin at the assessment volume. |
| Domains | Free Vercel and Railway subdomains | No custom domain in v1. |

If the project graduates beyond a take-home, the natural upgrade is Railway Pro for production-grade MySQL with longer backup retention, plus a custom domain — neither of which is on the v1 critical path.

---

## 15. Closing the planning phase

This is the last planning document. With it committed, the project has:

- A complete restatement of the brief and the assumptions we are operating under ([`01-requirements-analysis.md`](01-requirements-analysis.md)).
- A persona, persona questions, user journeys, and design principles to measure every feature against ([`02-product-thinking.md`](02-product-thinking.md)).
- A system architecture with explicit cross-cutting rules ([`03-architecture.md`](03-architecture.md)).
- A justified data model with indexes that match the queries we will run ([`04-data-model.md`](04-data-model.md)).
- A pinned-down API contract that the tests will assert against and the frontend will consume ([`05-api-design.md`](05-api-design.md)).
- A test pyramid, tooling, isolation strategy, and red-green-refactor cadence ([`06-tdd-strategy.md`](06-tdd-strategy.md)).
- Two performance stories with target numbers, a method, and an empty benchmark table to fill in ([`07-performance-plan.md`](07-performance-plan.md)).
- A consolidated decisions log with the *cost* recorded for every choice ([`08-tradeoffs.md`](08-tradeoffs.md)).
- An honest record of AI usage with overrides and prompting principles ([`09-ai-usage.md`](09-ai-usage.md)).
- This deployment plan with environment variables, release process, and first-deploy checklist (this document).

The next commit ends the planning phase. From there, the work is execution: scaffold the monorepo, set up tooling, then write failing tests, then write the code that makes them pass, one commit pair at a time, until the first-deploy checklist in §9 can be executed end-to-end.

There is nothing else to plan. Implementation begins next.
