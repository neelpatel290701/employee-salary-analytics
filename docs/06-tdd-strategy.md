# 06 — TDD Strategy

> **Purpose of this document.** This document is the rule-book for the implementation phase. It defines *how* we will practice Test-Driven Development on this project — what test lives at which layer, the tools we use, the data-isolation strategy, the determinism rules, the exact red-green-refactor commit cadence, and — critically — where TDD is **strict** and where it is **pragmatic** (because dogmatic TDD on boilerplate would clutter the commit history without buying real value). When the implementation phase begins, the answer to "what do I do next?" is in this document.

---

## 1. What TDD means here

The discipline is simple and the commit history must show it:

1. **Write a failing test** that expresses the behaviour we want.
2. **Commit the failing test** (`test:` prefix). This is the *red* step. The commit message names the behaviour.
3. **Write the minimum code** that makes the test pass.
4. **Commit the implementation** (`feat:` or `fix:` prefix). This is the *green* step.
5. **Refactor** if there is something meaningful to clean up — duplication, a sharper name, an over-long function.
6. **Commit the refactor** (`refactor:` prefix) only if step 5 actually changed anything.

Every behavioural commit pair (test, then implementation) is the unit. A reviewer reading the commit log can see the test land, see it pass, and read what was added — in that order — without context switching.

### 1.1 Why TDD for *this* project specifically

TDD is not a religious commitment. We are adopting it because, for this particular project, it pays back:

- **The brief asks for fast, deterministic, easy-to-understand tests.** Writing them first forces all three.
- **The insights aggregation logic is the most error-prone part of the system.** Median, percentiles, standard deviation, and outlier classification have a thousand off-by-one and floating-point traps. Hand-computed fixtures + tests-first catches them at definition time, not after a stakeholder questions a number.
- **The commit history is part of the deliverable.** A reviewer reading "test for empty-cohort behaviour → implementation handles n<5" learns more about our thinking than any final-state-only diff could communicate.
- **AI-assisted code needs an executable specification.** A failing test is the safest possible prompt — it pins down behaviour before AI generates an implementation, and it catches AI-induced bugs in the same loop they were introduced.

---

## 2. The pragmatic boundary — strict vs not-strict

Strict TDD means: **no production code without a failing test that requires it**. We apply this strictly to the code where it matters and pragmatically to the code where it would only generate noise. The boundary below is the rule, not a suggestion.

### 2.1 Where TDD is strict

These get red-green-refactor with a *failing-test* commit before the implementation commit:

- **Services** (`backend/src/services/*`) — every business rule, every aggregation, every orchestrator function.
- **Route handlers** (`backend/src/routes/*`) — every endpoint, exercised through Supertest against the running Express app + the test DB.
- **Schemas** (`packages/shared/src/schemas/*`) — every invariant gets at least one passing input and one rejecting input.
- **Repositories** (`backend/src/repositories/*`) — only the non-trivial query shapes (the percentile-source query, search across columns). Pure `prisma.X.findUnique` wrappers do not get a test of their own; they are exercised through the service tests that use them.
- **Frontend forms and data hooks** — anything with conditional rendering, validation, or non-trivial state.
- **The seed script's pure parts** — the name generator, the batched-insert chunker.

### 2.2 Where TDD is pragmatic

These do **not** get a tests-first commit. They get tests only where there is a behaviour worth pinning down.

- **Server bootstrap** (`backend/src/server.ts`) — wiring Express middleware, mounting routers. Exercised indirectly by every route test.
- **The Prisma client singleton** (`backend/src/db/prisma.ts`). Nothing to test.
- **The config parser** (`backend/src/config.ts`). A single test that asserts "throws on missing variable" is sufficient; we don't need a red-green dance for an env reader.
- **TypeScript type declarations** — the compiler is the test.
- **Pure-presentational React components** with no state — exercised by the feature tests that compose them.
- **Styling** — `*.css` and Tailwind class lists.

This boundary is the rule. If a reviewer reads a commit and asks "where is the failing test for this?", the answer is either *here it is, in the previous commit*, or *this is in §2.2 and here is why*.

---

## 3. The test pyramid for this app

```
                       ◢ slow, broad, expensive
                      ╱╲
                     ╱  ╲   E2E smoke (1 path)
                    ╱────╲
                   ╱      ╲  Frontend feature tests
                  ╱──────  ╲  (RTL + MSW, jsdom)
                 ╱          ╲
                ╱────────────╲ Backend integration tests
               ╱              ╲ (Supertest + real MySQL)
              ╱────────────────╲
             ╱                  ╲ Backend unit tests
            ╱                    ╲ (services, schemas, helpers)
           ╱──────────────────────╲
                       ◢ fast, narrow, cheap
```

| Layer | Count target | Speed target | Tooling | What it asserts |
|---|---|---|---|---|
| Backend unit | ~70 % of suite | < 50 ms per test | Vitest | Services, schemas, helpers. Pure, no DB, no Express. |
| Backend integration | ~25 % of suite | < 500 ms per test | Vitest + Supertest + real MySQL | Real HTTP requests against the actual app and a real test database. |
| Frontend feature | ~5 % of suite | < 300 ms per test | Vitest + React Testing Library + jsdom + MSW | User behaviour: "click Add Employee, fill the form, see the row appear." |
| E2E smoke | 1, maybe 2 | Acceptable to be slow | (Optional, see §10) | The single happy-path workflow end-to-end against a deployed-like environment. |

The point of the pyramid is **not** the percentages. The point is that we put each kind of confidence at the cheapest possible layer. Aggregation maths is unit-tested. HTTP behaviour is integration-tested. The form-filling flow is component-tested. A reviewer should never see "I aggregated three values" verified by a full browser test.

---

## 4. Tooling

| Concern | Choice | Why |
|---|---|---|
| **Test runner (everywhere)** | **Vitest** | One runner for backend and frontend means one mental model, one config style, one debugger setup. Fast (esbuild), Jest-API compatible, first-class ESM and TS. |
| **HTTP testing** | **Supertest** | The dominant integration-testing library for Node. Plugs straight into an Express `app` without binding a real port. |
| **Frontend component testing** | **React Testing Library** | Asserts on user-visible behaviour, not implementation. Discourages the "private-internals" tests that age badly. |
| **DOM environment** | **jsdom** (via Vitest's `environment: 'jsdom'`) | Lighter than a real browser; sufficient for everything except whole-page navigation. |
| **API mocking on the frontend** | **MSW (Mock Service Worker)** | Intercepts `fetch` at the network layer. The frontend code under test stays untouched; the API contract is the only thing being faked. |
| **Test data builders** | hand-rolled factory in `tests/_support/buildEmployee.ts` | Vetted defaults + per-test overrides. We do not pull in `faker` for tests (it is non-deterministic by default and overkill). |
| **Snapshots** | not used | Snapshots tend to encode incidental detail. We use explicit assertions on visible behaviour. |
| **Coverage reporter** | **Vitest `--coverage`** (c8 under the hood) | Reported but not chased; see §11. |

We are deliberately **not** using:

- **Jest.** Vitest is strictly better for a Vite-powered project.
- **Cypress / Playwright** as a primary tool. We may use Playwright for *one* smoke test at the end (§10), not as the spine of the suite.
- **Mock libraries for the database** (`prisma-mock`, `sinon`). Mocks lie; we run integration tests against the same MySQL we deploy to.

---

## 5. Data isolation — how integration tests don't step on each other

This is the most important practical decision in the document.

### 5.1 The rule

Every integration test starts against an **empty** `employees` table and ends without leaving state behind. There is no shared seed across tests; each test seeds the exact rows it needs.

### 5.2 The mechanism

```ts
// backend/tests/_support/db.ts
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE employees');
});
```

- `TRUNCATE` is **fast** in InnoDB at small row counts (sub-millisecond at the volumes our tests use, which are typically 3–20 rows).
- It resets auto-increments (we don't use them, but the discipline is the same).
- It is destructive — so we run integration tests against a dedicated database (`employee_analytics_test`), never against the development database.

### 5.3 Why we did not use transactional rollback

A common alternative is to wrap each test in `prisma.$transaction(async (tx) => { ...; throw ROLLBACK; })`. It is faster than `TRUNCATE` and gives perfect isolation. We considered it and rejected it for one reason: **the test exercises the real Express app, which creates its own Prisma client per request.** Threading a request-scoped transaction handle through Express requires `AsyncLocalStorage` plumbing that adds complexity to the production code purely to enable a test technique. The `TRUNCATE` approach keeps the production code clean.

At a much larger test count we might revisit this and accept the complexity. For this project, `TRUNCATE` per test is the right answer.

### 5.4 Parallel test execution

Vitest defaults to running test files in parallel. **For integration tests we disable parallelism** with `--no-file-parallelism` (or `pool: 'forks', poolOptions: { forks: { singleFork: true } }`), because every test truncates the same `employees` table. Parallel unit tests remain enabled because they don't touch the database.

The trade-off is a slower integration suite, but it stays correct and easy to debug — which beats fast-and-flaky every time.

### 5.5 The test database

- Name: `employee_analytics_test`.
- Lives in the same Docker Compose MySQL container as the dev database.
- Migrations applied by `prisma migrate deploy` against the test schema before the suite runs (in a one-line `globalSetup`).
- Never seeded with 10K rows. Each test seeds what it needs.

---

## 6. The red-green-refactor loop, with a concrete example

This is what the commit history will literally look like for one feature — the `POST /api/employees` endpoint.

### 6.1 Step 1 — write a failing test

```ts
// backend/tests/integration/employees.create.test.ts
describe('POST /api/employees', () => {
  it('creates an employee and returns 201 with a Location header', async () => {
    const res = await request(app).post('/api/employees').send(validEmployeeBody);
    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/^\/api\/employees\/[a-z0-9]{24,25}$/);
    expect(res.body.data).toMatchObject({
      email:     validEmployeeBody.email,
      fullName:  validEmployeeBody.fullName,
    });
  });

  it('returns 422 with field-level details when email is missing', async () => {
    const { email, ...rest } = validEmployeeBody;
    const res = await request(app).post('/api/employees').send(rest);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toContainEqual(
      expect.objectContaining({ path: ['email'] })
    );
  });

  it('returns 409 on duplicate email', async () => {
    await request(app).post('/api/employees').send(validEmployeeBody).expect(201);
    const res = await request(app).post('/api/employees').send(validEmployeeBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
```

### 6.2 Step 2 — commit the red

```
test(employees): add failing tests for POST /api/employees

Cover the three behaviours of the create endpoint contracted in
docs/05-api-design.md §5.2: a successful 201 with a Location
header, a 422 with structured field-level details when validation
fails, and a 409 when the unique-email constraint is violated.

These tests will fail until the create endpoint is implemented in
the next commit; that progression is the point of the TDD cadence.
```

The CI status at this point is **red**. That is intended.

### 6.3 Step 3 — write the minimum code

- Add the `zod` create-employee schema in `packages/shared`.
- Add the route handler in `backend/src/routes/employees.ts`.
- Add `createEmployee` in `backend/src/services/employees.ts`.
- Add `insertEmployee` in `backend/src/repositories/employees.ts`.

Each piece is the smallest version that makes the three tests pass — no over-design, no fields the tests don't require.

### 6.4 Step 4 — commit the green

```
feat(employees): implement POST /api/employees

Add the create-employee endpoint wired through the route → service
→ repository layers established in docs/03-architecture.md §3.2,
with the zod schema living in packages/shared so the frontend
form can consume the same contract.

The implementation is the minimum needed to satisfy the three
integration tests added in the previous commit: 201 + Location on
success, 422 + structured details on validation failure, and 409
on duplicate email (translated from Prisma's P2002 unique-
constraint error in the service layer, not in the route).
```

CI is **green**.

### 6.5 Step 5 — refactor (only if needed)

If, while writing the implementation, we noticed that the email-normalisation (trim + lowercase) is duplicated between the create schema and the read query, we extract a `normaliseEmail` helper into `packages/shared/src/helpers`. Otherwise, we skip this step entirely.

```
refactor(shared): extract email normalisation into a shared helper

Email normalisation (trim + lowercase) was duplicated between the
create-employee zod schema and the find-by-email repository query.
Extracted into packages/shared/src/helpers/normaliseEmail.ts so
both call sites share a single implementation.

No behavioural change; the existing tests pass without modification.
```

### 6.6 The cadence for any feature

The above is the template. For every feature we will implement:

| Step | Prefix | What it contains |
|---|---|---|
| 1 | `test:` | The failing tests that describe the new behaviour. |
| 2 | `feat:` or `fix:` | The minimum implementation that makes them pass. |
| 3 (sometimes) | `refactor:` | Non-behavioural clean-up. Skipped if there isn't anything worth cleaning. |

If a feature is large, we split it into smaller behaviours and run the cadence per behaviour. We never bundle two failing tests with two implementations in one commit.

---

## 7. Test naming convention

Test names describe the behaviour from the caller's point of view, not the implementation. The convention is:

- **`it('<does this observable thing>', ...)`** — verb-first, no "should." `it('returns 422 when email is missing', ...)` is right; `it('should validate email field', ...)` is wrong.
- **One concept per test.** If a test name has the word "and," it's two tests.
- **The describe block names the unit under test.** `describe('POST /api/employees', ...)` for routes, `describe('createEmployee()', ...)` for services, `describe('createEmployeeSchema', ...)` for schemas.
- **No magic-number assertions without a comment** — if a test asserts `medianSalary === '32500.00'`, the fixture above it shows how that number is derived (`[10000, 25000, 32500, 50000, 100000] → median is the middle value`).

---

## 8. Determinism rules

The brief specifically calls out *fast, deterministic, easy to understand* tests. The following are non-negotiable.

### 8.1 No real wall clock

Anything that reads `Date.now()` or `new Date()` indirectly (e.g. `prisma.findMany({ where: { createdAt: { gt: oneWeekAgo() } } })`) goes through a `clock` helper that can be frozen in tests:

```ts
// backend/src/lib/clock.ts
export const clock = { now: () => new Date() };

// in tests
clock.now = () => new Date('2026-05-29T00:00:00Z');
```

Anything calling `Date.now()` directly in business logic is a bug we will fix as part of writing the test for it.

### 8.2 No real randomness

The seed script uses a **seeded RNG** (`seedrandom` or an equivalent ~30-line implementation). When tests exercise the name generator, the seed is fixed and the assertions are deterministic.

`Math.random()` is forbidden in business logic. The only exception is `crypto.randomUUID` / Prisma's `cuid()` generator, both of which are scoped to identifier generation only and which the tests do not assert against by exact value.

### 8.3 No network

Backend integration tests hit the local MySQL only. Frontend tests intercept `fetch` via MSW. There is no test in this suite that calls a real external service.

### 8.4 No timers in tests

`setTimeout` / `setInterval` in production code is allowed, but tests never wait on them. Where the production code uses a timer, the test uses Vitest's `vi.useFakeTimers()` + `vi.advanceTimersByTime(ms)`.

### 8.5 Test order independence

No test depends on another test having run first. Removing any single test must leave the rest of the suite green.

---

## 9. Test data builders

The repeated pattern across tests is "I need a valid Employee with one or two fields tweaked." Inline object literals get unwieldy fast. We use a small builder per entity.

```ts
// backend/tests/_support/buildEmployee.ts
import type { CreateEmployeeInput } from '@app/shared';

export const buildEmployee = (overrides?: Partial<CreateEmployeeInput>): CreateEmployeeInput => ({
  email:           `priya.r+${counter.next()}@example.com`,
  fullName:        'Priya Ramaswamy',
  jobTitle:        'Senior Software Engineer',
  country:         'IN',
  department:      'ENGINEERING',
  salary:          '145000.00',
  employmentType:  'FULL_TIME',
  hireDate:        '2022-03-14',
  ...overrides,
});
```

- Sensible defaults that satisfy every validation rule.
- A counter behind the email field guarantees the unique constraint is not violated incidentally across tests.
- The builder is **synchronous** — it returns data, not a saved row. Tests choose whether to call `prisma.employee.create({ data: buildEmployee() })` or use it in a request body.
- For testing the aggregation maths, we build small, hand-computable arrays of Employees (see §10) rather than randomised data — randomness in test data is a flake risk.

---

## 10. Testing the insights — the precise approach

The aggregation maths is where bugs love to hide. Our discipline:

1. **Fixtures are tiny and hand-computed.** A test for "median salary" might insert 5 employees with salaries `[10000, 25000, 32500, 50000, 100000]` and assert `medianSalary === '32500.00'`. The values are explicit in the test; the answer is too.
2. **One invariant per test.** A single test does not validate `min`, `max`, `avg`, and `median` together — it validates one, with an obvious fixture.
3. **Edge cases are explicit.** The empty-cohort case (n=0), the single-employee case (n=1), the two-equal-salaries case, the cohort-below-5 outlier-suppression case — each one is its own named test.
4. **Floating-point tolerance is documented.** Where we compare computed aggregates, we either assert the **string** representation (which is what the API returns — no float drift) or use `toBeCloseTo(value, 2)` with the tolerance written down in the test.

### 10.1 Worked example — testing P50/P25/P75

```ts
describe('computePercentiles()', () => {
  it('returns the middle value for n=odd as median', () => {
    expect(computePercentiles([10, 20, 30, 40, 50]).p50).toBe(30);
  });

  it('returns the average of the two middle values for n=even as median', () => {
    expect(computePercentiles([10, 20, 30, 40]).p50).toBe(25);
  });

  it('computes P25 and P75 by linear interpolation', () => {
    // n=5 sorted: positions 0..4. Q1 at index (5-1)*0.25 = 1 -> value 20.
    expect(computePercentiles([10, 20, 30, 40, 50]).p25).toBe(20);
    // Q3 at index (5-1)*0.75 = 3 -> value 40.
    expect(computePercentiles([10, 20, 30, 40, 50]).p75).toBe(40);
  });

  it('returns null for every percentile on an empty input', () => {
    expect(computePercentiles([])).toEqual({ p25: null, p50: null, p75: null });
  });
});
```

The expected values are derived in code comments so a reader does not have to redo the maths.

---

## 11. Coverage philosophy

Coverage is **reported** for every PR but not **chased**. The targets are:

| Module | Branch-coverage target | Rationale |
|---|---|---|
| Services | ≥ 95 % | Business logic. Every branch matters. |
| Schemas | 100 % of rules (each invariant tested for accept and reject) | Schemas are the wall; gaps in schema tests are gaps in the wall. |
| Route handlers | 100 % of error paths (422, 404, 409, 500) | Error paths are exactly where reviewers expect rigour. |
| Repositories | ≥ 80 % (only the non-trivial queries are tested directly) | Trivial CRUD repos are exercised through services. |
| Frontend feature code | ≥ 80 % | Forms and hooks. Pure-display components are not chased. |

A coverage gap that is **conscious and explained** (e.g. "we don't test the 500-INTERNAL path; it is the catch-all and would require throwing manually") is better than a 100 % number achieved by trivial tests.

---

## 12. The optional E2E smoke

If time permits at the very end of the implementation phase, we add a **single** Playwright smoke test that:

1. Launches the SPA against a freshly-seeded test DB.
2. Adds an employee through the UI.
3. Navigates to Insights.
4. Asserts the country-stats row count incremented.

That is the entire E2E suite. We deliberately do not try to E2E-test every flow; the integration + component tests already cover the contracts. The smoke is *one* assertion that the whole stack starts.

If time does not permit, we skip it. The brief does not ask for E2E.

---

## 13. Running tests

The full command surface:

```bash
# Backend
npm --workspace backend run test               # unit tests, fast, no DB needed
npm --workspace backend run test:integration   # integration tests, requires docker compose up
npm --workspace backend run test:all           # both
npm --workspace backend run test -- --coverage # with coverage report

# Frontend
npm --workspace frontend run test              # component + hook tests
npm --workspace frontend run test:watch        # TDD inner loop

# Everything
npm test                                        # workspace-root alias; runs every package's `test`
```

The README will document each command and which services (Docker Compose) need to be running before each. The unit tests are the inner-loop tool; the integration tests are the merge gate.

---

## 14. Anti-patterns we will avoid

Recorded so we cannot drift into them by accident.

- **Tests that pass for the wrong reason.** Every test must have failed at least once before its implementation existed; that proves the assertion is meaningful.
- **Tests that depend on shared fixtures.** Every test seeds what it needs; no `beforeAll(insert10kEmployees)`.
- **Tests that assert on the database directly when they should assert on the API.** A route test reads through the HTTP boundary, not through Prisma — otherwise we are testing the implementation, not the contract.
- **Tests that mock the unit under test.** If a test for `createEmployee` mocks `createEmployee`, the test is meaningless.
- **Tests that snapshot large JSON blobs.** Snapshots make changes opaque. Explicit assertions on the specific keys we care about are better.
- **Tests that exercise typed boundaries that TypeScript already enforces.** "Calling with the wrong type fails to compile" is the test.
- **One mega-test per feature.** A test that asserts ten things tells us nothing about which one broke when it fails.

---

## 15. What we do next

With the testing rules pinned down, the implementation phase has its playbook. The next planning document — [`07-performance-plan.md`](07-performance-plan.md) — turns to the other quantitative deliverable in the brief: the seed script's runtime, the query plans behind the insight endpoints, and the benchmarks we will commit numbers against.
