# 05 — API Design

> **Purpose of this document.** This document is the contract between the backend and everything that talks to it — the frontend, the tests, and any future consumer. Every endpoint is listed, every request and response shape is pinned down, the conventions (pagination, filtering, sorting, errors, status codes) are decided once and applied uniformly, and each endpoint is traced back to the persona question or brief requirement that justifies it. When the TDD loop begins, the *test cases* will assert against this contract. When the frontend is built, the *API client* will type-check against it.

---

## 1. API design principles

The principles are short, opinionated, and applied to every endpoint without exception.

1. **REST over JSON.** Resources, not actions. `POST /employees`, not `POST /createEmployee`. The exception is the insights namespace, which is read-only and resource-shaped by *report*, not by the underlying entity — the persona thinks in reports, so we shape the URLs that way.
2. **JSON in, JSON out.** No form encoding. Bodies are `application/json`. Lists are returned in an envelope (see §2.2), never as bare arrays — this lets us add pagination metadata without breaking consumers later.
3. **The contract is a `zod` schema.** Each endpoint has a request schema and a response schema. The TypeScript types are inferred from them. The frontend imports the same schemas from `packages/shared`. The schemas are the source of truth; this document explains them.
4. **Validation is a wall, not a hedge.** Anything that fails to parse the request schema returns a structured `422` and never reaches a service. We do not "be lenient about" types.
5. **No magic.** No automatic mass-assignment, no field-stripping by convention. The request schema defines exactly which fields are accepted, and unknown fields are a 422 (zod's `.strict()`).
6. **HTTP semantics matter.** Status codes mean what they mean; `PATCH` is partial, `PUT` would be replace (we don't use `PUT`), `DELETE` returns `204` with no body, `POST` returns `201` with the created resource and a `Location` header.
7. **Idempotency follows REST norms.** `GET`, `PUT`, `DELETE` are idempotent. `POST` is not, but our `POST /employees` is functionally idempotent on email (a duplicate returns `409`, not a second row).

---

## 2. Conventions applied uniformly

### 2.1 Base path

Every endpoint lives under **`/api`**. We do not include a version segment (`/api/v1`) in v1 because there is no second version. The note in [§8](#8-versioning-rate-limiting-and-other-deferred-concerns) explains what we would do if we needed one.

### 2.2 Response envelope

Every successful response is one of two shapes:

```ts
// Single resource or scalar result
{ "data": <T> }

// Paginated list
{
  "data": <T[]>,
  "pagination": {
    "page": number,        // 1-indexed
    "pageSize": number,
    "total": number,       // total matching rows, BEFORE pagination
    "totalPages": number
  }
}
```

Every error response is one shape — see [§3](#3-error-model).

We use an envelope rather than returning a bare resource or a bare array because adding sibling fields later (`meta`, `included`, `warnings`) does not break clients that key off `data`.

### 2.3 Status codes we use

| Code | Used for |
|---|---|
| `200 OK` | Successful read / partial update / list |
| `201 Created` | Successful create. Includes the created resource and a `Location` header pointing to its canonical URL. |
| `204 No Content` | Successful delete. No body. |
| `400 Bad Request` | Malformed request (e.g. body is not valid JSON). |
| `404 Not Found` | The resource at the path does not exist. |
| `409 Conflict` | The request violates a uniqueness constraint (e.g. duplicate email). |
| `422 Unprocessable Entity` | The request was parseable but failed semantic validation (e.g. salary ≤ 0, unknown country code, missing required field). |
| `500 Internal Server Error` | Anything unhandled. The error envelope never contains an exception message in this case — only a stable code. |

The `400` vs `422` distinction is deliberate: `400` is reserved for "I could not even parse what you sent." `422` covers "I parsed it but it isn't valid." This makes the frontend's error handling cleaner — `422` is recoverable (show field-level errors), `400` is a bug.

### 2.4 Pagination

We use **offset-based pagination** with `page` and `pageSize` query parameters.

```
GET /api/employees?page=1&pageSize=50
```

- `page` is **1-indexed**.
- `pageSize` defaults to `50`. Maximum is `200`.
- Invalid values (`page=0`, `pageSize=1000`, `pageSize=-1`, `page="abc"`) all return `422` with a clear field-level error.
- The response always includes the `pagination` block in the envelope.

**Why offset, not cursor?** At 10K rows offset pagination is fast and simple. The HR Manager's flows do *not* include "infinite scroll through 10,000 rows" — they include "page through a filtered subset of 30–500 rows." Cursors would add complexity for a use case we do not have. If the data grows past ~100K rows, we would switch to keyset pagination on `(createdAt, id)` — captured as a follow-on in [`07-performance-plan.md`](07-performance-plan.md).

### 2.5 Filtering

Filters are exact-match query parameters, AND'd together.

```
GET /api/employees?country=US&department=ENGINEERING&employmentType=FULL_TIME
```

- `country` — ISO 3166-1 alpha-2 code. Validated against the static ISO list.
- `jobTitle` — exact string match (case-insensitive comparison).
- `department` — must be a valid `Department` enum value.
- `employmentType` — must be a valid `EmploymentType` enum value.
- Any unknown filter key is a `422`.

There is no "filter operator" syntax (no `salary[gte]=...`). For the only range-style filter we need (Journey 5 — salary range), we use the discrete pair `minSalary` / `maxSalary`. Open-ended operator syntax buys complexity we don't need.

### 2.6 Search

A single full-text-ish search parameter applies to `fullName` and `email`.

```
GET /api/employees?search=priya
```

- Implemented as `LOWER(fullName) LIKE '%term%' OR LOWER(email) LIKE '%term%'`.
- Minimum length: 1 character (after trim). Empty/whitespace = no search.
- At 10K rows, this is acceptable. A true full-text index is a future-perf concern documented in [`07-performance-plan.md`](07-performance-plan.md).

### 2.7 Sorting

```
GET /api/employees?sortBy=salary&sortOrder=desc
```

- `sortBy` — one of: `fullName`, `salary`, `hireDate`, `createdAt`, `updatedAt`. Default: `createdAt`.
- `sortOrder` — one of: `asc`, `desc`. Default: `desc`.
- Unknown `sortBy` values are a `422`. We validate against a closed list — we never accept arbitrary column names from the URL (that would be a tiny SQL-injection surface even with an ORM).
- Sort is stable: ties are broken by `id` so pagination is deterministic.

### 2.8 Naming

- URL segments are **lowercase, kebab-case** for multi-word resources: `/api/job-title-stats`, `/api/country-stats`.
- JSON property names are **camelCase**: `fullName`, `jobTitle`, `employmentType`, `hireDate`.
- Enum values follow the schema (`FULL_TIME`, `ENGINEERING`).

---

## 3. Error model

Every error response has the shape:

```ts
{
  "error": {
    "code": string,           // stable machine-readable code
    "message": string,        // human-readable explanation
    "details"?: unknown       // structured field-level info (validation errors)
  }
}
```

### 3.1 Stable error codes

| Code | HTTP | When |
|---|---|---|
| `BAD_REQUEST` | 400 | Body is not valid JSON; required path segment is missing or malformed. |
| `VALIDATION_FAILED` | 422 | The `zod` parser rejected the request. `details` contains `{ path, message }[]` for every failing field. |
| `NOT_FOUND` | 404 | The resource at `:id` does not exist. |
| `CONFLICT` | 409 | A uniqueness constraint would be violated (e.g. duplicate email on `POST /employees`). |
| `INTERNAL` | 500 | Anything we did not anticipate. `message` is generic; details never include the exception. |

### 3.2 Example error responses

```json
// 422 — invalid input
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [
      { "path": ["salary"],  "message": "Must be greater than 0" },
      { "path": ["country"], "message": "Invalid country code" }
    ]
  }
}
```

```json
// 404 — not found
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Employee not found"
  }
}
```

```json
// 409 — duplicate email
{
  "error": {
    "code": "CONFLICT",
    "message": "An employee with this email already exists"
  }
}
```

### 3.3 What the error model does **not** include

- **No exception messages.** A 500 never reveals a Prisma error string, a stack frame, or a file path.
- **No correlation IDs in the body** (the request ID is in the `X-Request-Id` response header instead — keeps the body schema simpler).

---

## 4. Endpoint inventory

A one-screen view of every endpoint. The details for each follow in §5 and §6.

| Method | Path | Purpose | Traces to |
|---|---|---|---|
| `GET` | `/api/health` | Health probe for Railway | Implicit |
| `GET` | `/api/employees` | List employees (paginated, filtered, sorted, searched) | F1, F2, F7, Q7, Journey 5 |
| `POST` | `/api/employees` | Create an employee | F1, Journey 1 |
| `GET` | `/api/employees/:id` | Read one employee | F2, Journey 4 |
| `PATCH` | `/api/employees/:id` | Update an employee | F3, Journey 4 |
| `DELETE` | `/api/employees/:id` | Delete an employee | F4 |
| `GET` | `/api/job-titles` | Distinct job titles, frequency-ranked, for autocomplete | A3, Journey 1 |
| `GET` | `/api/insights/summary` | Org-wide top-line numbers | Q6 |
| `GET` | `/api/insights/country-stats` | Per-country distributional stats (min/max/avg/median/P25/P75/n) | F7, Q3, Journey 2 |
| `GET` | `/api/insights/job-title-stats` | Per-job-title stats within a country (avg/median/n) | F8, Q4, Journey 3 |
| `GET` | `/api/insights/headcount` | Headcount by country and country × department | Q1, Q2, Journey 5 |
| `GET` | `/api/insights/outliers` | Employees > 2σ from country × job-title mean | Q5, Journey 4 |

Twelve endpoints. Each is below.

---

## 5. Employees — full contracts

### 5.1 `GET /api/employees` — list

**Query parameters** (all optional):

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | |
| `pageSize` | integer in [1, 200] | `50` | |
| `search` | string, 1–100 chars (after trim) | — | Matched against `fullName` and `email`. |
| `country` | ISO 3166-1 alpha-2 | — | |
| `jobTitle` | string, 1–100 chars | — | Exact, case-insensitive. |
| `department` | `Department` enum value | — | |
| `employmentType` | `EmploymentType` enum value | — | |
| `minSalary` | decimal ≥ 0 | — | Inclusive lower bound. |
| `maxSalary` | decimal ≥ 0 | — | Inclusive upper bound. |
| `sortBy` | one of `fullName`, `salary`, `hireDate`, `createdAt`, `updatedAt` | `createdAt` | |
| `sortOrder` | `asc` \| `desc` | `desc` | |

**Response 200:**

```json
{
  "data": [
    {
      "id":              "clw1...",
      "email":           "priya.r@example.com",
      "fullName":        "Priya Ramaswamy",
      "jobTitle":        "Senior Software Engineer",
      "country":         "IN",
      "department":      "ENGINEERING",
      "salary":          "145000.00",
      "employmentType":  "FULL_TIME",
      "hireDate":        "2022-03-14",
      "createdAt":       "2026-05-29T08:31:12.413Z",
      "updatedAt":       "2026-05-29T08:31:12.413Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 50, "total": 9821, "totalPages": 197 }
}
```

Note that `salary` is returned as a **string** to preserve `DECIMAL` precision through JSON. The shared `zod` schema parses it as a `Decimal` on read and serialises it back to string on write. We do not use `number` for salary anywhere — see [`04-data-model.md`](04-data-model.md) §2.1.

### 5.2 `POST /api/employees` — create

**Request body:**

```ts
{
  email:            string  // RFC-5322 shape, lowercased on the server
  fullName:         string  // 1..200 chars (trimmed)
  jobTitle:         string  // 1..100 chars (trimmed)
  country:          string  // ISO 3166-1 alpha-2
  department:       Department
  salary:           string  // decimal string, > 0
  employmentType?:  EmploymentType  // default FULL_TIME
  hireDate:         string  // YYYY-MM-DD, not in the future
}
```

**Response 201:**

- Body: `{ "data": Employee }` — the created row.
- Header: `Location: /api/employees/<id>`

**Error responses:**

- `422 VALIDATION_FAILED` — any field failed validation. `details` lists every failing field.
- `409 CONFLICT` — an employee with that email already exists.

### 5.3 `GET /api/employees/:id` — read one

- `:id` is a CUID. Anything that isn't a valid CUID returns `404` (we don't leak format errors here — we treat the URL as a single opaque key).
- Response 200: `{ "data": Employee }`
- Response 404: standard error envelope.

### 5.4 `PATCH /api/employees/:id` — update

- The body accepts **any subset** of the create-body fields, with the same per-field validation.
- Empty body is a `422` (`{ "message": "At least one field is required" }`) — silent no-ops are a footgun.
- The `email` field, if present, is checked for uniqueness across other rows.
- Response 200: `{ "data": Employee }` — the updated row.
- Response 404: not found.
- Response 409: email collision with another row.
- Response 422: validation.

### 5.5 `DELETE /api/employees/:id` — delete

- Response 204: empty body.
- Response 404: not found.

This is a **hard delete** by assumption A5 in [`01-requirements-analysis.md`](01-requirements-analysis.md).

### 5.6 `GET /api/job-titles` — distinct titles for autocomplete

**Query parameters:**

| Name | Type | Default | Notes |
|---|---|---|---|
| `search` | string, 1–100 chars | — | Optional prefix-style filter (`LIKE 'term%'`). |
| `limit` | integer in [1, 50] | `10` | |

**Response 200:**

```json
{
  "data": [
    { "jobTitle": "Senior Software Engineer", "count": 312 },
    { "jobTitle": "Software Engineer",        "count": 287 }
  ]
}
```

Backs the create/edit form's job-title autocomplete (Assumption A3, Journey 1).

---

## 6. Insights — full contracts

The insights namespace is **read-only**. Every endpoint is a `GET` and the response is a `{ data: ... }` envelope. Aggregations are computed against the full data set in MySQL where possible; percentiles are computed in application code (see [`04-data-model.md`](04-data-model.md) §1.2).

### 6.1 `GET /api/insights/summary`

Top-of-page snapshot for the Insights view.

**No query parameters.**

**Response 200:**

```json
{
  "data": {
    "totalHeadcount":       9821,
    "totalAnnualPayrollUsd": "984512000.00",
    "averageTenureYears":   3.4,
    "countryCount":         42,
    "jobTitleCount":        118,
    "departmentBreakdown": [
      { "department": "ENGINEERING",      "count": 3210 },
      { "department": "SALES",            "count": 1845 }
    ]
  }
}
```

### 6.2 `GET /api/insights/country-stats`

Per-country distributional stats.

**Query parameters:**

| Name | Type | Default | Notes |
|---|---|---|---|
| `country` | ISO 3166-1 alpha-2 | — | If present, returns a one-item array for that country. If absent, returns one item per country with ≥ 1 employee. |
| `sortBy` | `count` \| `averageSalary` \| `medianSalary` | `count` | |
| `sortOrder` | `asc` \| `desc` | `desc` | |

**Response 200:**

```json
{
  "data": [
    {
      "country":        "US",
      "count":          1842,
      "minSalary":      "45000.00",
      "maxSalary":      "412000.00",
      "averageSalary":  "138421.55",
      "medianSalary":   "131000.00",
      "p25Salary":      "92500.00",
      "p75Salary":      "172500.00",
      "totalPayrollUsd":"255012471.00"
    }
  ]
}
```

Every row carries its **sample size (`count`)** per design principle #2 in [`02-product-thinking.md`](02-product-thinking.md).

### 6.3 `GET /api/insights/job-title-stats`

Per-job-title stats within a country.

**Query parameters:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `country` | ISO 3166-1 alpha-2 | **Yes** | Required — the brief's F8 is "for the given Job Title in a country", and an org-wide-by-title metric would aggregate across very different markets. |
| `jobTitle` | string | No | If present, returns just that title in that country. If absent, returns every title with ≥ 1 employee in the country. |
| `sortBy` | `count` \| `averageSalary` \| `medianSalary` | `count` | |
| `sortOrder` | `asc` \| `desc` | `desc` | |

**Response 200:**

```json
{
  "data": [
    {
      "country":       "DE",
      "jobTitle":      "Senior Software Engineer",
      "count":         148,
      "averageSalary": "92500.00",
      "medianSalary":  "91000.00",
      "p25Salary":     "84000.00",
      "p75Salary":     "101000.00"
    }
  ]
}
```

### 6.4 `GET /api/insights/headcount`

Headcount grouped by country, or by country × department.

**Query parameters:**

| Name | Type | Default | Notes |
|---|---|---|---|
| `groupBy` | `country` \| `country_department` | `country` | |

**Response 200 (`groupBy=country`):**

```json
{ "data": [ { "country": "US", "count": 1842 }, { "country": "IN", "count": 1411 } ] }
```

**Response 200 (`groupBy=country_department`):**

```json
{
  "data": [
    { "country": "US", "department": "ENGINEERING", "count": 612 },
    { "country": "US", "department": "SALES",       "count": 348 }
  ]
}
```

### 6.5 `GET /api/insights/outliers`

Employees whose salary is **more than 2 standard deviations** from the mean of their `(country, jobTitle)` cohort.

**Query parameters:**

| Name | Type | Default | Notes |
|---|---|---|---|
| `country` | ISO 3166-1 alpha-2 | — | If present, restrict to that country. |
| `direction` | `above` \| `below` \| `both` | `both` | |
| `limit` | integer in [1, 200] | `50` | |

**Response 200:**

```json
{
  "data": [
    {
      "employee":          { "id": "clw1...", "fullName": "Aarav Sharma", "jobTitle": "Customer Support Lead", "country": "MX" },
      "salary":            "98000.00",
      "cohortMean":        "32400.00",
      "cohortStdDev":      "8100.00",
      "deviationsFromMean":  8.1,
      "direction":         "above"
    }
  ]
}
```

Critically, every outlier carries the employee's `id` so the UI can link straight through to the record — design principle #7 in [`02-product-thinking.md`](02-product-thinking.md) ("outliers must be actionable"). A cohort with fewer than 5 employees is **excluded** from outlier analysis (standard deviation is noisy at low n); this threshold is documented in the schema.

### 6.6 `GET /api/health`

```json
{ "status": "ok" }
```

Cheap and side-effect-free. Used by Railway's healthcheck.

---

## 7. Validation rules — the central reference

Rather than restating every rule per endpoint, here is the canonical list. The `zod` schemas in `packages/shared` are the single source of truth; this table mirrors them so the reviewer doesn't have to read the code to know what's validated.

| Field / param | Rule |
|---|---|
| `email` | Trimmed, lowercased, matches a permissive RFC-5322 regex, length ≤ 254. |
| `fullName` | Trimmed, length 1–200. |
| `jobTitle` | Trimmed, length 1–100. |
| `country` | Exactly 2 uppercase letters; in the static ISO 3166-1 alpha-2 list. |
| `department` | Enum value from `Department`. |
| `employmentType` | Enum value from `EmploymentType`. |
| `salary` | Decimal string with up to 2 decimal places, > 0, ≤ 9_999_999_999.99. |
| `hireDate` | `YYYY-MM-DD`, parses to a real date, not in the future. |
| `page` | Integer ≥ 1. |
| `pageSize` | Integer in `[1, 200]`. |
| `search` | Trimmed, length 1–100. |
| `minSalary`, `maxSalary` | Decimal strings ≥ 0; if both present, `minSalary ≤ maxSalary`. |
| `sortBy`, `sortOrder` | Whitelisted closed sets, per §2.7. |
| `groupBy` (insights) | `country` \| `country_department`. |
| `direction` (outliers) | `above` \| `below` \| `both`. |
| `limit` | Endpoint-specific positive-integer cap; the rule is documented per endpoint. |

Unknown fields in request bodies are rejected (`zod.strict()`).

---

## 8. Versioning, rate limiting, and other deferred concerns

| Concern | v1 decision | If/when we need it |
|---|---|---|
| **URL versioning** | No version segment in the URL. | If we ever ship a breaking change, the new endpoints live under `/api/v2/` and the old ones remain functional for a deprecation window. |
| **Rate limiting** | None. The user is a single trusted HR Manager on an internal tool. | When the tool grows multi-tenant or becomes externally reachable, we add per-tenant token-bucket limiting in middleware. |
| **CORS** | Whitelist exactly the Vercel origin in production; allow `localhost:5173` in dev. | More origins → config-driven list. |
| **CSRF** | Not applicable — the API is consumed exclusively by a same-origin SPA (in dev via the Vite proxy; in prod the cookie story is N/A because we have no auth). | If we ever add cookie-based auth, double-submit CSRF tokens. |
| **Auth** | None — assumption A4 in [`01-requirements-analysis.md`](01-requirements-analysis.md). | The minimal pragmatic move would be a single API key in a header, before any real user-system. |
| **Bulk operations** | None. The brief does not require them. | If a real user need emerges, a `POST /employees:bulk` endpoint that accepts an array and returns per-row results would be the right shape. |
| **Soft deletes / restore** | Not applicable — hard delete by assumption A5. | Add a `deletedAt` column + a `?includeDeleted=true` flag and a `POST /employees/:id/restore` endpoint. |
| **Webhooks / events** | Not applicable. | A simple `outbox` pattern would be the right starting point. |

These are *not* features we will build. They are recorded so the reviewer can see the limits of v1 are deliberate, and so future-us has an obvious starting point if any of them becomes load-bearing.

---

## 9. The API as a traceability checkpoint

A final consistency check. The brief lists what must be possible; every line below is satisfied by an endpoint above.

| Requirement (from [`01-requirements-analysis.md`](01-requirements-analysis.md) / [`02-product-thinking.md`](02-product-thinking.md)) | Endpoint(s) |
|---|---|
| F1 — Add an employee via the UI | `POST /api/employees` (consumed by the create dialog) |
| F2 — View employees | `GET /api/employees`, `GET /api/employees/:id` |
| F3 — Update an employee | `PATCH /api/employees/:id` |
| F4 — Delete an employee | `DELETE /api/employees/:id` |
| F7 — Min/max/avg salary per country | `GET /api/insights/country-stats` |
| F8 — Avg salary per job title in a country | `GET /api/insights/job-title-stats` |
| F9 — Additional meaningful metrics | `GET /api/insights/summary`, `/headcount`, `/outliers` |
| Q1 — Where are our people? | `GET /api/insights/headcount?groupBy=country` |
| Q2 — Country × department split | `GET /api/insights/headcount?groupBy=country_department` |
| Q3 — Comp distribution in a country | `GET /api/insights/country-stats?country=` |
| Q4 — Comp by job title in a country | `GET /api/insights/job-title-stats?country=` |
| Q5 — Outliers | `GET /api/insights/outliers` |
| Q6 — Org-wide summary | `GET /api/insights/summary` |
| Q7 — Find one person | `GET /api/employees?search=` |
| Q8 — CRUD on people | Employee endpoints above |
| Implicit: job-title autocomplete | `GET /api/job-titles` |
| Implicit: deploy probe | `GET /api/health` |

Every brief requirement and every persona question is served by an endpoint, and every endpoint is justified by a requirement or persona question. There are no orphans on either side.

---

## 10. What we do next

With the contract pinned down, we have everything we need to write **tests first**. The next document — [`06-tdd-strategy.md`](06-tdd-strategy.md) — defines the test pyramid, the tooling, the data-isolation strategy, and the exact red-green-refactor loop we will follow once the planning phase concludes and the implementation commits begin.
