# 08 — Trade-offs and Decisions Log

> **Purpose of this document.** Across the previous seven planning docs we made dozens of consequential decisions. This document is the single page a reviewer can read to understand every "why" without re-reading those docs. Each entry follows the same shape: what we chose, the alternative we considered most seriously, the reason we picked the chosen option, the *cost* we are accepting by not picking the alternative, and a forward-pointer to the doc where the decision was originally established. There is no narrative drift here — only the decisions and their reasoning, indexed for fast lookup.

---

## 1. How to read this document

Every entry below has four parts:

- **Chose.** The decision.
- **Over.** The alternative we considered most seriously (other alternatives are typically mentioned but secondary).
- **Why.** The reason this won.
- **Cost.** What we are giving up by not picking the alternative. Recording this honestly is the point of a trade-off log — pretending a decision has no cost is what makes engineering blogs untrustworthy.

Where the reasoning is short, the entry is one or two lines. Where the decision is consequential or non-obvious, the entry is longer.

---

## 2. Tier-1 decisions — the consequential ones

These are the decisions that shape the rest of the project. They get more space because changing them later is expensive.

### 2.1 Three-tier monolith with an independently-deployed frontend

- **Chose.** A single backend service (Express + Prisma + MySQL), a separate React SPA (Vite-built static bundle), deployed to two platforms (Railway + Vercel).
- **Over.** A Next.js full-stack app with API routes deployed entirely on Vercel.
- **Why.** A single persona, ~10K rows, no async or multi-tenant workload, and no SEO need — the problem is shaped like a monolith. Keeping the frontend and backend separately deployable mirrors how a real internal HR tool would be operated, and lets the API serve other consumers (a future CSV exporter, a Slack bot) without a rewrite. A reviewer can read the whole system top-to-bottom in fifteen minutes.
- **Cost.** Two deployment surfaces to keep healthy instead of one. CORS configuration to maintain. Two `.env` files instead of one. We accept these because the deployment story is more *honest* this way.
- **Established in.** [`03-architecture.md`](03-architecture.md) §1.

### 2.2 MySQL over PostgreSQL (and over SQLite)

- **Chose.** MySQL 8, accessed via Prisma, run locally by Docker Compose and hosted on Railway in production.
- **Over.** PostgreSQL (functionally equivalent for this workload, with the bonus of native `PERCENTILE_CONT`). And over SQLite, the brief's suggested option.
- **Why.** The user explicitly chose MySQL. MySQL 8 is more than capable at 10K rows; Railway has a managed MySQL plugin; the Prisma MySQL connector is mature; and a reviewer can read the SQL without a primer.
- **Cost.** We have to compute percentiles in application code rather than in SQL, because MySQL 8 does not provide native `PERCENTILE_CONT`. At our scale (≤ 2K rows per country) this is cheaper and easier to test anyway — see [`07-performance-plan.md`](07-performance-plan.md) §3.3 — but at 100K+ rows per country we would switch the percentile computation to a window-function approach (and would seriously consider switching to Postgres).
- **Established in.** [`04-data-model.md`](04-data-model.md) §1.

### 2.3 Monorepo with a `packages/shared` workspace for zod schemas

- **Chose.** A npm workspace containing `packages/shared` (zod schemas + inferred types), consumed by both `backend` and `frontend`.
- **Over.** Two independent repos with duplicated schemas, or one repo with copy-paste between two `src/` trees.
- **Why.** The schemas are the API contract. If the client form and the server parser drift, we silently lose validation. Sharing the source guarantees they cannot drift. The monorepo overhead at this size is small (npm workspaces handle it without extra tooling).
- **Cost.** Slightly more involved CI (when we add it); reviewers unfamiliar with workspaces may find the layout less immediately obvious than two independent folders.
- **Established in.** [`03-architecture.md`](03-architecture.md) §6.3 and §7.

### 2.4 Strict TDD on business logic, pragmatic elsewhere

- **Chose.** A test-fails-first commit must precede every implementation commit for services, route handlers, schemas, non-trivial repository queries, forms, and the seed script's pure parts. Boilerplate (server bootstrap, the Prisma client singleton, env parsing, type declarations, pure-presentational components) does not get the red-green dance — it gets tests where there is behaviour worth pinning down, and nothing where there isn't.
- **Over.** Strict TDD everywhere (so even `prisma.ts` would get a "client is defined" test).
- **Why.** TDD pays back where the cost of a bug exceeds the cost of writing the test first — business rules, aggregations, validation. On boilerplate, the test cost dominates and the commit log becomes noisy. We are optimising for *meaningful* tests and a readable commit history, not for the appearance of orthodoxy.
- **Cost.** A reviewer who expects "every commit must have a test in front of it" will see a few commits without one (server bootstrap, the Prisma singleton). The boundary is documented and defended in the TDD doc so this is not a surprise.
- **Established in.** [`06-tdd-strategy.md`](06-tdd-strategy.md) §2.

### 2.5 `TRUNCATE`-per-test integration isolation, not transactional rollback

- **Chose.** Each integration test starts with `TRUNCATE TABLE employees` and seeds the rows it needs.
- **Over.** Wrapping each test in `prisma.$transaction(async (tx) => { ...; throw ROLLBACK; })`. Faster, more isolated.
- **Why.** Transactional rollback requires threading a request-scoped transaction handle through Express via `AsyncLocalStorage`, which adds plumbing to *production code* purely to enable a test technique. `TRUNCATE` in InnoDB at small row counts is sub-millisecond and keeps the production code clean.
- **Cost.** Slower integration suite (we lose tens of milliseconds per test from `TRUNCATE` cost). And: integration tests must run **single-fork**, because they share the same `employees` table. Documented in [`06-tdd-strategy.md`](06-tdd-strategy.md) §5.4.
- **Established in.** [`06-tdd-strategy.md`](06-tdd-strategy.md) §5.

### 2.6 Real MySQL in integration tests, never a mocked database

- **Chose.** Backend integration tests hit the same MySQL we deploy to (Docker Compose locally, the same engine as Railway).
- **Over.** A mocked Prisma client (`prisma-mock`, `sinon`), or an in-memory SQLite as a stand-in.
- **Why.** Mocks lie. A test that passes against a fake Prisma proves nothing about what production will do. Engine differences between SQLite and MySQL bite the moment a query uses a function the other dialect handles differently. The brief explicitly asks for production-quality code; mocked-DB tests are not that.
- **Cost.** The integration suite requires Docker Compose to be running. A reviewer with no Docker cannot run the integration tests, only the unit tests. We mitigate by making the integration suite a single command and the unit suite the inner-loop one.
- **Established in.** [`03-architecture.md`](03-architecture.md) §6.6 and [`06-tdd-strategy.md`](06-tdd-strategy.md) §4.

### 2.7 Docs-first commits before any implementation

- **Chose.** The first ten commits are planning documents (this is one of them). No production code lands until they are all in.
- **Over.** Code-first, with docs written retrospectively or only in PR descriptions.
- **Why.** The assessment is explicitly judged on *how we think, design, and build* — not just on the final artefact. Codifying the reasoning before the code creates a paper trail of the design that a reviewer can read in any order. It also forces us to confront the hard questions (currency, country codes, percentile computation in MySQL) *before* they become bugs.
- **Cost.** Several hours of effort up front before a single line of production code is written. We accept that cost for an assessment; in a normal engineering setting we would scale the docs to the size of the change.
- **Established in.** [`README.md`](../README.md) and the repository commit log.

---

## 3. Stack and tooling decisions

| # | Chose | Over | Why | Cost | Where |
|---|---|---|---|---|---|
| 3.1 | Node + TypeScript + Express | Fastify, NestJS, Python + FastAPI | Express is the most familiar Node web framework to any reviewer; TypeScript is non-negotiable for shared-schema correctness; we get nothing from NestJS's class decorators that we don't get more transparently from plain Express + zod. | Fastify is faster, but we are not latency-bound. NestJS is more opinionated; we lose its conventions in exchange for fewer layers. | [`03-architecture.md`](03-architecture.md) §3.2 |
| 3.2 | Prisma as the ORM | Drizzle, Kysely, TypeORM, raw `mysql2` | Prisma's migration story is the strongest in Node, the query API is type-safe, and the `executeRawUnsafe` escape hatch handles the seed-script hot loop. | Drizzle is closer to raw SQL and has lower runtime cost; we accept Prisma's overhead in exchange for the migration ergonomics. | [`03-architecture.md`](03-architecture.md) §3.3 |
| 3.3 | Vite + React SPA | Next.js (App Router) | No SEO need, no marketing pages, a single authenticated-by-trust user. Vite is faster to build, simpler to model, and matches the "internal tool" shape. The independent frontend deployment is also more honest with this shape. | We lose Next.js's server components, route handlers, and built-in API. None of these were going to help us. | [`03-architecture.md`](03-architecture.md) §3.1 |
| 3.4 | shadcn/ui + Tailwind | Material UI, Ant Design, Chakra | shadcn gives us composable, owned components that we can adjust; Tailwind composes them. The result is small, fast, and stylable without fighting a component-library theme. | Bigger libraries ship more out of the box (e.g. MUI's DataGrid). We re-implement small pieces of that ourselves — but they are small at this scope. | [`03-architecture.md`](03-architecture.md) §3.1 |
| 3.5 | TanStack Query for server state; react-hook-form for forms | Redux / Zustand / Jotai layered on top | TanStack Query already owns caching, invalidation, retries, and the "writes immediately update the list" guarantee. Redux would be a wrapper around what TanStack Query already does. | We lose the optionality of "Redux for everything." We do not need that optionality. | [`03-architecture.md`](03-architecture.md) §6.7 |
| 3.6 | zod for validation | Yup, Joi, hand-rolled | zod's TypeScript-first design lets us *infer* types from schemas — one source of truth for shape and validation. Yup's TS support is weaker; Joi predates TypeScript. | zod's bundle is slightly larger than Yup's; immaterial here. | [`03-architecture.md`](03-architecture.md) §6.1 |
| 3.7 | Vitest as test runner (backend + frontend) | Jest | One runner for both packages, esbuild-fast, first-class ESM and TS, Jest-API compatible. | Vitest is younger than Jest and has slightly different snapshot semantics; immaterial since we are not using snapshots. | [`06-tdd-strategy.md`](06-tdd-strategy.md) §4 |
| 3.8 | Supertest for HTTP testing | A real port + `fetch` | Supertest plugs straight into the Express `app` without binding a port; simpler and faster. | None worth recording. | [`06-tdd-strategy.md`](06-tdd-strategy.md) §4 |
| 3.9 | React Testing Library + jsdom + MSW | Cypress / Playwright as primary | RTL asserts on user-visible behaviour; jsdom is fast enough; MSW intercepts at the network layer so we test the contract, not the implementation. Cypress/Playwright would be slower and overkill as the spine of the suite. | We add Playwright only for an optional single E2E smoke at the end ([`06-tdd-strategy.md`](06-tdd-strategy.md) §10). | [`06-tdd-strategy.md`](06-tdd-strategy.md) §4 |
| 3.10 | `pino` for logging | `winston`, `console.log` | Structured JSON, fast, low overhead. Standard in modern Node. | None. | [`03-architecture.md`](03-architecture.md) §6.5 |

---

## 4. Data-layer decisions

| # | Chose | Over | Why | Cost | Where |
|---|---|---|---|---|---|
| 4.1 | `CHAR(25)` CUID for the primary key | Auto-increment `INT`; UUID v4 | CUID is lexicographically sortable (good for B-tree locality), URL-safe, does not leak row counts. | Auto-increment ints are smaller and faster; we are happy to trade ~17 bytes per row for "URL doesn't leak total headcount." | [`04-data-model.md`](04-data-model.md) §2.1 |
| 4.2 | `fullName` as one field | `firstName` + `lastName` | Many global naming conventions do not fit a first/last split (mononyms, given-name-first cultures, complex surnames). One field is the honest answer at global scale. | We cannot sort or filter by surname. The persona never asked for that. | [`04-data-model.md`](04-data-model.md) §2.1 |
| 4.3 | `country` as `CHAR(2)` ISO 3166-1 alpha-2 | Free-string "United States" / "USA" | An external authoritative standard. Eliminates "USA" vs "U.S." silent data-quality bugs that would corrupt every country aggregation. | We must convert codes to display names in the UI. Cheap. | [`04-data-model.md`](04-data-model.md) §2.1 |
| 4.4 | `department` as a Prisma enum | Free string; a lookup table | Departments *are* a small controlled vocabulary in real HR. An enum gives DB-level integrity without a join. | Adding a department requires a migration — which is the right amount of friction. | [`04-data-model.md`](04-data-model.md) §2.1, §5.2 |
| 4.5 | `jobTitle` as a free string with autocomplete | A `job_titles` lookup table; a Prisma enum | Real organisations do not have a controlled job-title vocabulary; forcing one is friction. UI autocomplete from frequency-sorted existing values gives convergence without enforcement. | Some data-entry noise is possible. The autocomplete suppresses most of it. | [`04-data-model.md`](04-data-model.md) §5.3 |
| 4.6 | `DECIMAL(12, 2)` for salary | `FLOAT` / `DOUBLE` | Money does not live in IEEE 754 floats. `DECIMAL(12, 2)` gives 10-billion-USD range with cent precision and exact arithmetic. | Slightly larger storage; immaterial. | [`04-data-model.md`](04-data-model.md) §2.1 |
| 4.7 | Single currency, USD-normalised | Multi-currency display + FX | Multi-currency adds historical FX rates, conversion rules, and display preferences. It would dominate the engineering of a v1 that is supposed to be about salary insights. | Honest cross-country comparison requires the *user* to normalise salaries before entering them. Documented in assumption A1. | [`01-requirements-analysis.md`](01-requirements-analysis.md) §5 |
| 4.8 | Hard delete | Soft delete with `deletedAt` | The brief does not ask for restore or audit. Hard delete is the simpler answer for v1; soft delete is a clean follow-on if a real audit need emerges. | A deleted employee is gone. Documented in assumption A5. | [`01-requirements-analysis.md`](01-requirements-analysis.md) §5 |
| 4.9 | Indexes only where a query justifies them | "Index defensively, drop unused later" | Every index is paid for on every write. Defensive indexes carry write-cost forever for queries that may never come. | A future query might need an index we don't have; we add it when the query is added, in the same commit. | [`04-data-model.md`](04-data-model.md) §4 |
| 4.10 | App-side percentile computation | SQL window functions | MySQL 8 has no native `PERCENTILE_CONT`; the window-function emulation is several lines of SQL with a CTE. At our scale (≤ 2K per country) the app-side compute is cheaper and easier to test. | At 100K+ rows per country we would switch to SQL-side; documented in [`07-performance-plan.md`](07-performance-plan.md) §9. | [`04-data-model.md`](04-data-model.md) §1.2 |

---

## 5. API decisions

| # | Chose | Over | Why | Cost | Where |
|---|---|---|---|---|---|
| 5.1 | REST over JSON | tRPC; GraphQL | REST is what the brief implies; reviewers do not need project-specific RPC conventions to read the code. We get tRPC's type-safety win via the shared zod schemas. | tRPC offers slightly better DX; we are happy to trade DX for legibility. | [`05-api-design.md`](05-api-design.md) §1 |
| 5.2 | Response envelope `{ data, pagination? }` | Bare resource / bare array | Envelope leaves room for sibling fields later (`meta`, `included`, `warnings`) without breaking consumers. | One level of indentation in the response payload. | [`05-api-design.md`](05-api-design.md) §2.2 |
| 5.3 | `400 BAD_REQUEST` vs `422 VALIDATION_FAILED` distinction | One generic 400 for both | Frontend error handling is cleaner: 422 is recoverable (show field errors), 400 is a bug. | A small convention to teach; documented per endpoint. | [`05-api-design.md`](05-api-design.md) §2.3 |
| 5.4 | Offset pagination (`page` + `pageSize`) | Cursor pagination | At 10K rows offset is fast and supports "jump to page N." The persona's flows are not infinite-scroll. | At 100K+ rows offset becomes slow at deep pages; documented in [`07-performance-plan.md`](07-performance-plan.md) §9. | [`05-api-design.md`](05-api-design.md) §2.4 |
| 5.5 | `salary` returned as a string in JSON | Returned as a number | Preserves `DECIMAL(12, 2)` precision through JSON, which has no native decimal type. | Frontend has to parse the string; the shared schema does this once. | [`05-api-design.md`](05-api-design.md) §5.1 |
| 5.6 | No URL versioning in v1 (`/api`, not `/api/v1`) | Always-versioned URL | Versioning a URL we will never break is YAGNI. If we ever ship a breaking change, the new endpoints live under `/api/v2`. | If we forget the convention and ship breaking changes silently, clients break. We won't. | [`05-api-design.md`](05-api-design.md) §2.1, §8 |
| 5.7 | No rate limiting in v1 | Token-bucket on every endpoint | Single trusted internal user. Rate limiting is for multi-tenant or externally-reachable APIs. | If the API ever becomes externally reachable, we add it. | [`05-api-design.md`](05-api-design.md) §8 |
| 5.8 | Outlier endpoint excludes cohorts with `n < 5` | Include them anyway | Standard deviation is meaningless at very low n; surfacing "Sarah is 7σ from her cohort of 2" is misleading. | We may miss an isolated outlier in a small cohort. Acceptable for the persona's use case. | [`05-api-design.md`](05-api-design.md) §6.5 |

---

## 6. Process and workflow decisions

| # | Chose | Over | Why | Cost | Where |
|---|---|---|---|---|---|
| 6.1 | Conventional-commit prefixes (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`) | Free-form messages | A reviewer can `git log --oneline` and immediately see the cadence: test→feat→refactor per feature. | A discipline to maintain; cheap once internalised. | [`06-tdd-strategy.md`](06-tdd-strategy.md) §6.6 |
| 6.2 | One concept per commit | Bundled "WIP: today's work" | The history is a narrative. A commit that does three things is unreviewable. | More commits; nothing else lost. | [`06-tdd-strategy.md`](06-tdd-strategy.md) §6 |
| 6.3 | Author prepares, user runs the commit | Author runs `git commit` directly | The user has explicit control over what enters their git history; matches their workflow preference. | A small turn-around delay per commit. | Workflow preference, recorded in repo memory |
| 6.4 | No `Co-Authored-By: Claude` trailer on commits | Include the trailer | The assessment is the user's submission; AI usage is documented separately and in detail in [`09-ai-usage.md`](09-ai-usage.md). Trailers would confuse the authorship of a personal submission. | A reviewer who reads only commit metadata won't know AI was used; the dedicated doc covers it. | [`README.md`](../README.md), [`09-ai-usage.md`](09-ai-usage.md) |
| 6.5 | Migrations are forward-only | `down` migrations | The convention most production teams adopt; eliminates "the down didn't quite work" incidents. | Reverting a change is two migrations (a new forward one) instead of one. | [`04-data-model.md`](04-data-model.md) §7 |

---

## 7. Scope decisions — what we are not building

These are the things we explicitly decided not to build, with the alternative being "build it anyway."

| # | Not building | Why | Where |
|---|---|---|---|
| 7.1 | Authentication / authorisation | The brief does not ask for it; adding it is scope creep that distracts from what is evaluated. Documented as assumption A4. | [`01-requirements-analysis.md`](01-requirements-analysis.md) §5 |
| 7.2 | Multi-tenancy | One organisation by the brief; multi-tenant adds row-level security, tenant routing, and a second access surface for no v1 win. | [`01-requirements-analysis.md`](01-requirements-analysis.md) §6 |
| 7.3 | Audit log / change history | Useful in real HR, not asked for, hard delete makes a clean v1. Soft delete + audit is a clean follow-on. | [`01-requirements-analysis.md`](01-requirements-analysis.md) §6 |
| 7.4 | CSV import / export | The seed script gives engineers bulk data ingestion; export is not asked for. A `POST /employees:bulk` endpoint is the right shape if a real need emerges. | [`01-requirements-analysis.md`](01-requirements-analysis.md) §6, [`05-api-design.md`](05-api-design.md) §8 |
| 7.5 | Salary history (effective-dated salaries) | We model current salary only. A `salary_history` table with effective-from/to is the right v2. | [`04-data-model.md`](04-data-model.md) §2.4 |
| 7.6 | Org chart / reporting lines | Different product; the salary tool stays in its lane. | [`02-product-thinking.md`](02-product-thinking.md) §7 |
| 7.7 | Multi-currency display | All salaries USD-normalised; FX conversion is a separate engineering project. | [`04-data-model.md`](04-data-model.md) §2.4 |
| 7.8 | Bulk operations in v1 | Single-row CRUD covers every persona flow; bulk is a future endpoint shape. | [`05-api-design.md`](05-api-design.md) §8 |
| 7.9 | Gender pay gap metric | Important in the real world, but the brief doesn't capture gender and inferring it from names is unacceptable. Mentioned as a natural follow-on. | [`02-product-thinking.md`](02-product-thinking.md) §4.2 |
| 7.10 | Market-benchmark comparison | Requires an external data source (Levels.fyi, Radford). Out of scope; useful at v2. | [`02-product-thinking.md`](02-product-thinking.md) §4.2 |

---

## 8. Decisions we expect to revisit at higher scale

The v1 choices are right for **10,000 employees**. They are not the choices we would make for 100,000 or 1,000,000. This table consolidates the future-work scattered across the other docs so a reviewer can see — at a glance — that the v1 plan is *bounded*, not naïve.

| Choice today | What changes at higher scale | Where to look |
|---|---|---|
| `LIKE '%term%'` search | MySQL `FULLTEXT INDEX`, then a dedicated engine (OpenSearch, Meilisearch) | [`07-performance-plan.md`](07-performance-plan.md) §9 |
| Offset pagination | Keyset on `(createdAt, id)` | [`07-performance-plan.md`](07-performance-plan.md) §9 |
| App-side percentile compute | SQL window functions; or switch to Postgres for `PERCENTILE_CONT` | [`04-data-model.md`](04-data-model.md) §1.2 |
| `INSERT` batches in seed | `LOAD DATA LOCAL INFILE` from generated CSV | [`07-performance-plan.md`](07-performance-plan.md) §2.3 |
| No server-side cache | Redis keyed by query params, invalidated on writes | [`07-performance-plan.md`](07-performance-plan.md) §4 |
| Hard delete | Soft delete + restore endpoint | [`05-api-design.md`](05-api-design.md) §8 |
| `pino` request logs | OpenTelemetry traces → APM (Datadog, Honeycomb) | [`07-performance-plan.md`](07-performance-plan.md) §5 |
| Single Railway service | Stateless multi-instance behind a load balancer; pgbouncer-equivalent connection pooler | [`07-performance-plan.md`](07-performance-plan.md) §9 |
| Single MySQL primary | Read replicas; insights routed to replicas | [`07-performance-plan.md`](07-performance-plan.md) §9 |
| No authentication | API-key middleware, then real user-system, then RBAC | [`01-requirements-analysis.md`](01-requirements-analysis.md) §5–§6 |

---

## 9. The decisions this document does *not* capture

A few decisions are deliberately *not* in this log:

- **Variable, function, and file names.** These are best read in the code, not relitigated in a document.
- **Internal code style** (semicolons, single vs double quotes, etc.). Set by Prettier + ESLint configs, not by a doc.
- **Choice of which IDE features to use.** Personal.

Recording them here would be noise. Their absence is intentional.

---

## 10. What we do next

This document is the closing argument for the planning phase. The next document — [`09-ai-usage.md`](09-ai-usage.md) — turns from "what we decided" to "how we decided it" with AI tooling in the loop: the prompts that mattered, the moments AI accelerated us, and the moments where we over-ruled AI suggestions and why.
