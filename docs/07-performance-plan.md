# 07 — Performance Plan

> **Purpose of this document.** The brief explicitly calls out two performance dimensions: the **seed script must be fast** because engineers will run it regularly, and the **application must remain usable at 10,000 employees**. This document is the plan for both — the strategy we will execute during the implementation phase, the targets we are committing to, the experiments we will run to verify them, and the table of benchmark numbers we will fill in (and commit) as we measure. Two narrower goals are explicit: (a) prove our chosen approach is sound *on paper* before we write code, and (b) leave a clear measurement framework so the actual numbers can be plugged in honestly later.

---

## 1. The two performance stories

| Story | What "good" looks like | Where it gets verified |
|---|---|---|
| **Seed throughput** | 10,000 employees in **under ~2 seconds** on a modern laptop, with the script being idempotent (re-runnable) and deterministic (seeded RNG). | A `time npm run seed` invocation; numbers committed to §8 of this doc during the implementation phase. |
| **Insight query latency** | Every insight endpoint returns in **under ~300 ms p95** at 10,000 rows. The employee-list endpoint returns in **under ~200 ms p95**. | Integration tests measure round-trip times; ad-hoc benchmark with `autocannon`; numbers committed to §8. |

We separate the two because they have different bottlenecks (write-side throughput vs read-side latency), different optimisation levers, and different ways they can fail. Treating them as one "performance" goal would mask the real engineering decisions.

---

## 2. Seed-script performance — the plan

The brief is explicit: *"engineers run this script regularly, and performance of the script matters."* That sentence shapes everything below.

### 2.1 The bottleneck, in one sentence

The bottleneck is **per-row round-trip cost to MySQL**, not CPU, not memory. A naive implementation will do 10,000 round-trips, and each round-trip is ~1 ms even on a local Docker MySQL, so the floor for a naive approach is ~10 seconds. Anything faster requires batching.

### 2.2 The optimisation ladder

We will implement the seed in four progressively more efficient ways, **and commit a benchmark at each step**, so the commit history reads as a performance investigation. The reviewer should be able to read the commit log and see the script get faster, with measured numbers, not assertions.

| Step | Approach | Hypothesis (10k rows) | Why it is faster than the previous step |
|---|---|---|---|
| **0 — naïve** | `for (each row) await prisma.employee.create({ data })` | 20–40 seconds | The baseline. One INSERT, one round-trip, per row. |
| **1 — `createMany`** | `prisma.employee.createMany({ data: rows, skipDuplicates: false })` in chunks of 1,000 | 2–4 seconds | Prisma generates a single multi-row `INSERT INTO ... VALUES (...), (...), ...` per chunk. ~10 round-trips total instead of 10,000. |
| **2 — single transaction wrapping all chunks** | Same `createMany`, but inside one `prisma.$transaction([...])` | 1.5–3 seconds | Removes per-chunk autocommit overhead. The whole load is one transaction. |
| **3 — raw multi-row INSERT** | `prisma.$executeRawUnsafe('INSERT INTO employees (...) VALUES ?', tuples)` with explicit chunking and an outer transaction | < 1 second target | Bypasses Prisma's parameter-formatting overhead for the hot loop. We accept the trade-off of bypassing Prisma's type safety **only here**, because the seed script's input shape is locked. |

We will **stop at step 3 if we hit the target**. Step 4 below is documented but not implemented in v1.

### 2.3 The stretch optimisation we are *not* doing (and why)

`LOAD DATA INFILE` from a generated CSV is the fastest method of bulk-loading data into MySQL, often by another order of magnitude. We considered it and decided against it for v1:

- It requires either a server-side file (`LOAD DATA INFILE`) or the `LOCAL` variant which has security implications and is disabled by default on managed MySQL like Railway's.
- The complexity (write a CSV to disk, then point MySQL at it, then delete the CSV) exceeds the savings at 10K rows.
- We would happily reach for it at **100k+** rows. The implementation plan documents this so it isn't seen as an oversight.

### 2.4 What the seed script is allowed to assume

- **It always wipes `employees` before inserting.** Engineers run it regularly to reset state, per assumption A6 in [`01-requirements-analysis.md`](01-requirements-analysis.md). The wipe is guarded behind a `--confirm` flag in any environment whose `DATABASE_URL` looks production-like (a heuristic: presence of a non-`localhost` host).
- **Names files are read into memory once.** `first_names.txt` and `last_names.txt` are loaded at startup, split, kept as in-memory arrays. We never re-read them.
- **Generation is deterministic.** A seeded RNG (`seedrandom`) feeds name pairing, country selection, job-title selection, salary distribution, and hire-date selection. The same seed produces the same 10,000 employees byte-for-byte. This matters for benchmark comparability across runs.
- **Memory is bounded.** Even at 10K rows the in-memory dataset is small (<10 MB), but the script chunks rather than accumulating everything in a single array before write, so the same approach scales linearly with `--count`.

### 2.5 The structure the seed will follow

```ts
// pseudo-code
const firstNames = readLines('prisma/first_names.txt');
const lastNames  = readLines('prisma/last_names.txt');
const rng        = seedrandom(opts.seed ?? 'employee-salary-analytics');

await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');

const BATCH = 1000;
const rows  = [];
for (let i = 0; i < opts.count; i++) {
  rows.push(generateOne(firstNames, lastNames, rng, i));
  if (rows.length >= BATCH) {
    await insertBatch(rows.splice(0, rows.length));
  }
}
if (rows.length) await insertBatch(rows);
```

`generateOne` is **pure**. `insertBatch` is the only place that talks to the database. This split is what makes the generator unit-testable and the script benchmarkable.

### 2.6 What is tested, and how

- `generateOne` and the chunker are unit-tested per [`06-tdd-strategy.md`](06-tdd-strategy.md) §2.1. They are pure functions with seeded RNG inputs.
- The full seed is exercised by a single integration test that runs it against a fresh test DB with `--count=100` and asserts `prisma.employee.count() === 100`. We do **not** run a 10K-row test on every CI run — that test is slow and its job is the manual benchmark, not the gate.

---

## 3. Insight-query latency — the plan

### 3.1 Which queries we will run, and the index that serves each

This is a restatement of [`04-data-model.md`](04-data-model.md) §4 in the language of EXPLAIN plans. Each endpoint's primary query and the access path the planner should take are listed below.

| Endpoint | Primary SQL shape | Expected access path |
|---|---|---|
| `GET /api/insights/country-stats` (no filter) | `SELECT country, COUNT(*), MIN, MAX, AVG, SUM FROM employees GROUP BY country` | `ix_employees_country` covering scan |
| `GET /api/insights/country-stats?country=X` | `SELECT MIN, MAX, AVG, SUM, COUNT FROM employees WHERE country = ?` + a second `SELECT salary FROM employees WHERE country = ? ORDER BY salary` for percentile computation | `ix_employees_country` range scan |
| `GET /api/insights/job-title-stats?country=X` | `SELECT jobTitle, COUNT, AVG, SUM FROM employees WHERE country = ? GROUP BY jobTitle` + percentile-source select per group | `ix_employees_country_title` |
| `GET /api/insights/headcount?groupBy=country` | `SELECT country, COUNT(*) FROM employees GROUP BY country` | `ix_employees_country` |
| `GET /api/insights/headcount?groupBy=country_department` | `SELECT country, department, COUNT(*) FROM employees GROUP BY country, department` | `ix_employees_country_dept` |
| `GET /api/insights/outliers[?country=X]` | `SELECT id, fullName, jobTitle, country, salary FROM employees [WHERE country = ?] ORDER BY country, jobTitle` then app-side classification | `ix_employees_country_title` |
| `GET /api/insights/summary` | A handful of `COUNT(*)`, `SUM(salary)`, `COUNT(DISTINCT country)`, `COUNT(DISTINCT jobTitle)`, and an average-tenure calc | Full scan (acceptable at 10K — and `summary` is invoked rarely) |

### 3.2 Verifying the plans

During implementation we will, for each non-trivial query:

1. Run `EXPLAIN ANALYZE <query>` against a 10K-row seeded database.
2. Confirm the `key` column lists the expected index.
3. Confirm `rows examined` is the small number we expect (the index's selectivity, not the full table).
4. Paste the abbreviated EXPLAIN output into the commit message of the change that introduced the query.

The commit history will therefore contain *proof that the planner is using the index*, not just an assertion that it should.

### 3.3 Percentiles, again

The percentile computation is application-side (see [`04-data-model.md`](04-data-model.md) §1.2). The performance argument:

- Even the largest country in a 10K-employee org tops out at ~2,000 employees.
- `SELECT salary FROM employees WHERE country = ? ORDER BY salary` returning 2,000 `DECIMAL` values is ~16 KB on the wire and a few milliseconds of network.
- Sorting 2,000 doubles in JavaScript is sub-millisecond.
- Computing P25/P50/P75 by linear interpolation over an already-sorted array is `O(1)` per percentile.
- Total per-country percentile cost: well under 10 ms even with overhead.

We will not paginate the percentile-source query. If, at higher scale, a country had 100,000 employees, we would switch to the SQL-side window-function approach documented in [`04-data-model.md`](04-data-model.md) §1.2.

### 3.4 Outlier detection cost

The naïve outlier query computes the country × jobTitle mean and stddev, then flags rows beyond 2σ. The complexity:

- One pass to compute `(mean, stddev, count)` per `(country, jobTitle)` group → MySQL does this directly with `AVG()` + `STDDEV_POP()`.
- One pass to flag rows whose distance from the group mean exceeds 2 × stddev.

We do both passes in the **application layer**, against the row set fetched by the indexed query in §3.1, because the app-side code is easier to test than two-statement SQL with a CTE and self-join. The cost is one full read of the (country-filtered) rows — at most ~10K rows × ~80 bytes ≈ 800 KB — which is trivially fast.

Cohorts with `count < 5` are **excluded** from outlier analysis. This is a correctness choice (stddev is meaningless at small n) that also bounds the work.

### 3.5 The list and search endpoint

`GET /api/employees` is the highest-traffic endpoint in practice. Its performance budget:

- **Pagination count.** A `SELECT COUNT(*) FROM employees [WHERE ...]` runs alongside the page query. At 10K rows with the right index, this is sub-millisecond. We deliberately do **not** use `SQL_CALC_FOUND_ROWS` — it's deprecated in MySQL 8.
- **Page query.** `SELECT ... FROM employees [WHERE ...] ORDER BY ... LIMIT ? OFFSET ?`. The order-by column matters; sorting by `createdAt` is supported by the implicit row order plus a tiebreaker; sorting by `salary` requires either a temp table (small at 10K) or an index. We are not adding a `salary` index — see [`04-data-model.md`](04-data-model.md) §4.1 — so salary sorts will use a filesort at 10K rows, which is acceptable.
- **Search.** `WHERE LOWER(fullName) LIKE '%term%' OR LOWER(email) LIKE '%term%'` is a full scan. At 10K rows the scan is ~5 ms. We do not pre-emptively add a full-text index; it would carry cost on every write and the performance need does not justify it at this scale.

### 3.6 The connection pool

Prisma's default pool is `max = num_physical_cpus * 2 + 1`. For a single-user internal tool on a small Railway instance, we will **set the pool to 5** — large enough to handle a handful of concurrent requests (the SPA may fire multiple insight queries in parallel) and small enough to stay well within Railway's default MySQL connection budget.

---

## 4. Caching strategy

| Layer | Decision | Why |
|---|---|---|
| **Client (browser)** | **TanStack Query** with `staleTime: 30s` on insight queries; `staleTime: 0` (always refetch on mount, but cache between transitions) on the employees list. | The SPA caches by default. We tune the stale-times to match the persona's expectations — insights don't change second-to-second, but the list does after a write. Write mutations explicitly invalidate the affected queries. |
| **Server (Express)** | **None.** | Premature. Workload is single-user, 10K rows. A cache adds invalidation complexity for latency we already meet. Documented as a future lever if needed. |
| **Database (MySQL)** | **InnoDB buffer pool**, default size for the managed instance. | We don't tune this; Railway's default is reasonable for this volume. |
| **CDN (Vercel)** | Static SPA assets cached at edge by default. | Free win. |

The principle: every cache is **defaulted in or defaulted out** rather than added speculatively. We can add Redis if a measured need emerges. We will not add Redis because we read about it on a blog.

---

## 5. Observability in v1

We are not bringing in Datadog, OpenTelemetry, or APM in v1. The observability surface is intentionally small:

- **Structured request logs** via `pino`, including `requestId`, `method`, `path`, `status`, `durationMs`.
- **Slow-query logging** at the application layer: any HTTP handler taking > 500 ms emits a warning log.
- **A `GET /api/health` endpoint** for Railway's healthcheck.
- **The benchmark table** in §8 of this document, updated by hand when we run the benchmark commands.

If this app graduates from a take-home to a real product, the upgrade path is documented in §9.

---

## 6. The benchmark methodology

We are committing to a benchmark *method*, not just numbers, so the reviewer can reproduce.

### 6.1 Seed-script benchmark

```bash
# from backend/
docker compose up -d
npm run prisma:migrate:deploy
time npm run seed -- --count=10000 --seed=42
```

- Each measurement is the **average of three consecutive runs** after one warm-up.
- The reported number is the `real` time from `time(1)`.
- The Docker MySQL container is left running between runs to keep the buffer pool warm.
- The seed truncates first; we are not measuring a partial.

### 6.2 Insight-query latency benchmark

```bash
# in one terminal
npm run dev

# in another
autocannon -d 10 -c 10 'http://localhost:3000/api/insights/country-stats'
autocannon -d 10 -c 10 'http://localhost:3000/api/insights/country-stats?country=US'
autocannon -d 10 -c 10 'http://localhost:3000/api/insights/job-title-stats?country=US'
autocannon -d 10 -c 10 'http://localhost:3000/api/insights/headcount?groupBy=country_department'
autocannon -d 10 -c 10 'http://localhost:3000/api/insights/outliers?country=US'
```

- 10 seconds, 10 concurrent connections each.
- We record p50 and p95 latencies from `autocannon`'s output.
- The data set is the deterministic 10K-employee seed (`--seed=42`).

### 6.3 List-endpoint latency benchmark

```bash
autocannon -d 10 -c 10 'http://localhost:3000/api/employees?page=1&pageSize=50'
autocannon -d 10 -c 10 'http://localhost:3000/api/employees?page=1&pageSize=50&country=US'
autocannon -d 10 -c 10 'http://localhost:3000/api/employees?search=priya&page=1&pageSize=50'
```

---

## 7. Determinism of the benchmarks

Benchmarks that flap teach us nothing. We control variance by:

- **Seeded data.** Same 10K rows every run.
- **Warm cache.** One discarded warm-up run before measurement.
- **Same machine.** All numbers below are taken on a single developer laptop; deployment-environment numbers are a different table.
- **`autocannon`-recommended settings.** Short bursts (10s) with moderate concurrency (10) — these are stable on a laptop, unlike single-request timing.

---

## 8. The benchmark commitment table

This is the table we will fill in **during implementation**, in a commit titled `chore: record measured benchmarks`. Empty cells today; populated cells when measured.

### 8.1 Seed-script throughput

| Approach | Run 1 | Run 2 | Run 3 | Median | Notes |
|---|---|---|---|---|---|
| 0 — naïve `create` per row | _ | _ | _ | _ | Will not be merged; measured to establish the floor. |
| 1 — `createMany`, chunks of 1,000 | _ | _ | _ | _ | First merged version. |
| 2 — single transaction wrapping all chunks | _ | _ | _ | _ | |
| 3 — raw multi-row INSERT | _ | _ | _ | _ | Final version if hitting target. |

Target: median(3) **< 2 s**.

### 8.2 Insight-endpoint latency at 10K rows

| Endpoint | p50 (ms) | p95 (ms) | Notes |
|---|---|---|---|
| `GET /api/insights/country-stats` | _ | _ | All countries. |
| `GET /api/insights/country-stats?country=US` | _ | _ | Single country. |
| `GET /api/insights/job-title-stats?country=US` | _ | _ | |
| `GET /api/insights/headcount?groupBy=country` | _ | _ | |
| `GET /api/insights/headcount?groupBy=country_department` | _ | _ | |
| `GET /api/insights/outliers?country=US` | _ | _ | |
| `GET /api/insights/summary` | _ | _ | |

Targets: p95 **< 300 ms** for every row above.

### 8.3 List-endpoint latency at 10K rows

| Endpoint | p50 (ms) | p95 (ms) | Notes |
|---|---|---|---|
| `GET /api/employees?page=1&pageSize=50` | _ | _ | Unfiltered. |
| `GET /api/employees?page=1&pageSize=50&country=US` | _ | _ | Filtered. |
| `GET /api/employees?search=priya&page=1&pageSize=50` | _ | _ | Searched. |

Target: p95 **< 200 ms** for every row above.

---

## 9. Where we would invest at higher scale

The implementation choices above are right for 10,000 employees. They are not the choices we would make for 100,000 or 1,000,000. Recording the upgrade path here makes the v1 choices defensible.

| Concern | v1 (10K rows) | What changes at higher scale |
|---|---|---|
| Seed loading method | `INSERT` batches | `LOAD DATA LOCAL INFILE` from generated CSV |
| Percentile computation | App-side, fetch + sort | SQL-side window function (`ROW_NUMBER() OVER (ORDER BY salary)` joined to `COUNT(*)`) — Postgres `PERCENTILE_CONT` if the DB engine permits |
| Search predicate | `LIKE '%term%'` | MySQL `FULLTEXT INDEX (fullName, email)` first; a dedicated search engine (OpenSearch, Meilisearch) at very high scale |
| Pagination | Offset | Keyset on `(createdAt, id)` |
| Insight caching | None (server) | Redis with TTL keyed by query parameters, invalidated by employee writes |
| Connection pool | 5 | Sized to (CPU × 2) + 1 on each app instance, behind a connection-pooler (PgBouncer or ProxySQL equivalent) |
| Observability | `pino` request logs | OpenTelemetry traces → an APM (Datadog, Honeycomb, Tempo) |
| Backend topology | Single Railway service | Multiple stateless instances behind a load balancer; sticky session not required since we are stateless |
| Database | Single MySQL instance | Primary + read replicas; insights routed to replicas |

None of these are v1 work. They are the *honest forward-look* that prevents the v1 plan from being mistaken for "what we'd ship at scale."

---

## 10. What we do next

With the performance plan committed to paper, the remaining planning is non-quantitative: the next document — [`08-tradeoffs.md`](08-tradeoffs.md) — collects every consequential decision made so far, names the alternative, and explains why the chosen path won. It is the single page a reviewer can read to understand every "why" without re-reading the other nine documents.
