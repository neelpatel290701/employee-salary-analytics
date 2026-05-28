# 04 — Data Model

> **Purpose of this document.** The architecture doc settled the *shape* of the system; this doc settles its *substance*. What an "employee" actually is in the database, why each field is there (every field justified, none speculative), which constraints are enforced and where, which indexes we are creating and why each one earns its keep against an actual query, and the schema-evolution rules we will hold ourselves to. Where a decision was non-obvious, the rejected alternatives are recorded alongside.

---

## 1. Why MySQL

The user chose MySQL. We endorse the choice for these reasons:

- **The workload is relational and OLTP-shaped.** Employees, with structured fields, retrieved with predicate filters and grouped aggregates. A relational store is the right family.
- **MySQL 8 is more than capable at 10K rows.** Aggregations across 10K rows complete in tens of milliseconds on a modest instance. We are not stressing the engine.
- **Railway offers a managed MySQL plugin** which means production deployment is one click and one environment variable, with daily backups and metrics provided.
- **Prisma's MySQL connector is mature.** Migrations, the type-safe query builder, and the `executeRaw` escape hatch we use in the seed script are all first-class.
- **The team familiarity argument applies.** MySQL is the most widely-deployed relational database in the world. Anyone reviewing this code can read it without a primer.

### 1.1 Why not the alternatives

| Alternative | Why we did not choose it |
|---|---|
| **PostgreSQL** | Equally good for this workload; Postgres' richer window-function set (native `PERCENTILE_CONT`) would have made percentile queries one line shorter. We would happily switch if the user preferred. Not chosen because the user chose MySQL. |
| **SQLite** | The brief offers SQLite as an example, but a salary-management tool for a 10,000-employee organisation does not run on SQLite in production. Choosing it would make the deployment story dishonest. Architectural notes elaborate in [`08-tradeoffs.md`](08-tradeoffs.md). |
| **A NoSQL store** (MongoDB, DynamoDB) | The data is small, relational, and aggregation-heavy. NoSQL would force us to denormalise something that has no need to be denormalised, and would lose us SQL's free aggregate primitives. |

### 1.2 One quirk of MySQL we have to design for

MySQL 8 does **not** provide native `PERCENTILE_CONT` / `PERCENTILE_DISC` aggregate functions. Percentiles (the **median**, **P25**, **P75** that we promised the persona in [`02-product-thinking.md`](02-product-thinking.md) §4.1) therefore cannot be computed with a one-line aggregate the way they could in Postgres.

We have two viable approaches:

1. **Compute percentiles in application code** by selecting the relevant salaries `ORDER BY salary` and walking the list in a single pass. Trivially correct, easy to unit-test, and at 10K rows per country (at most — usually far fewer) the network and memory cost is negligible.
2. **Compute percentiles in SQL** using window functions (`ROW_NUMBER() OVER (ORDER BY salary)` against a `COUNT(*)`).

We will use **approach #1** because it is easier to test, easier to read, and the performance is more than sufficient at this scale. Approach #2 is documented in [`07-performance-plan.md`](07-performance-plan.md) as the path we would take if the data grew an order of magnitude.

---

## 2. The Employee entity

This is the only entity in the system. (Justification for *not* introducing more tables — countries, departments, job titles — is in §5.)

### 2.1 The fields

Below is the canonical field list. Each field has a column type, a constraint, the reason it exists, and — where relevant — the rejected alternative.

| Field | DB type | Nullable | Default | Reason it exists | Notable alternative considered |
|---|---|---|---|---|---|
| `id` | `CHAR(25)` (CUID) | No | generated | Stable primary key independent of any business attribute. CUID gives us a sortable, URL-safe identifier without exposing a row count. | Auto-increment `INT`: rejected because it leaks total headcount via the URL and creates predictable IDs. UUID v4: random and OK, but worse for B-tree locality. CUID lands cleanly between the two. |
| `email` | `VARCHAR(254)` | No | — | Unique, stable, human-recognisable identifier for an employee. Useful as the canonical lookup key from external systems (HRIS, SSO, payroll). | Email is normalised to lowercase at write time so case differences don't create duplicates. |
| `fullName` | `VARCHAR(200)` | No | — | Required by the brief. 200 chars accommodates long names with diacritics. | Splitting into `firstName` / `lastName` was considered and rejected: many names worldwide do not fit that split (mononyms, complex surnames, given-name-first cultures, etc.). `fullName` is the only field that is honest at global scale. |
| `jobTitle` | `VARCHAR(100)` | No | — | Required by the brief and the analytical pivot for the per-job-title metric. | Storing as a free string (not a lookup table) is justified in §5. The UI offers autocomplete from existing values to encourage consistency without forcing it. |
| `country` | `CHAR(2)` | No | — | Required by the brief and the analytical pivot for the per-country metrics. Stored as an **ISO 3166-1 alpha-2** code. | Storing the human-readable country name was rejected because "United States" vs "USA" vs "U.S." would silently corrupt the country-level aggregations. ISO codes give us referential integrity for free, against a stable global standard. The UI converts back to a readable name for display. |
| `department` | `ENUM` | No | — | Drives Q2 ("headcount by country × department") and Journey 5 ("filter by Engineering in Europe"). | A free-string `department` was rejected in favour of an enum because departments are a small, controlled vocabulary in any real HR setting — and an enum gives the analytics free correctness. The trade-off is that adding a department requires a migration; this is the right rigidity for the field. |
| `salary` | `DECIMAL(12, 2)` | No | — | Required by the brief and the central quantity of every insight. | `FLOAT` / `DOUBLE` was rejected outright: monetary values must not live in IEEE 754 floats. `DECIMAL(12, 2)` supports up to ~10 billion USD per row, which is overkill in the right direction. Currency is **USD only** by Assumption A1 in [`01-requirements-analysis.md`](01-requirements-analysis.md). |
| `employmentType` | `ENUM` | No | `FULL_TIME` | Salary numbers are only comparable within the same employment type — a Contractor day-rate and a Full-Time salary are not the same shape of money. Lets us filter (and, in v1, segment) the analytics fairly. | Defaulting to `FULL_TIME` because it is the overwhelmingly common case in HR data and most rows can omit the field on input. |
| `hireDate` | `DATE` | No | — | Enables tenure-derived metrics ("average tenure" in the org-wide summary) and "recently joined" filters. | `DATETIME` was rejected — time of day is irrelevant for a hire date and storing it invites timezone bugs. `DATE` keeps the field timezone-free. |
| `createdAt` | `DATETIME(3)` | No | `now()` | Standard audit field; lets us answer "employees added in the last 24 hours" without an audit table. | — |
| `updatedAt` | `DATETIME(3)` | No | `now()` (updated on write) | Standard audit field; lets us answer "employees changed since X." | — |

### 2.2 Enum values

```ts
enum Department {
  ENGINEERING
  PRODUCT
  DESIGN
  SALES
  MARKETING
  CUSTOMER_SUPPORT
  FINANCE
  HR
  OPERATIONS
  LEGAL
  OTHER
}

enum EmploymentType {
  FULL_TIME
  PART_TIME
  CONTRACT
  INTERN
}
```

These are deliberately small. `OTHER` exists in `Department` to avoid blocking writes when an unusual function comes up; we will not blanket-allow free-string departments behind an `OTHER` rationale, but we will not pretend our list is exhaustive either.

### 2.3 Field-level invariants (enforced where)

We enforce constraints at the layer that owns them, never in two places without reason.

| Invariant | Where it's enforced | Why there |
|---|---|---|
| `email` is unique | DB `UNIQUE INDEX` *and* application-level check before insert | The DB guarantees correctness even under concurrent writes; the application check converts the violation into a clean `409 CONFLICT` instead of a 500. |
| `email` is RFC-5322-shaped and lowercased | `zod` schema | Format validation does not belong in the database. |
| `salary > 0` | `zod` schema | Same as above — DB-level `CHECK` could be added but the app boundary is sufficient and gives better error messages. |
| `country` is a valid ISO 3166-1 alpha-2 code | `zod` schema (against a static list of valid codes) | Validating against the ISO list in `zod` catches typos before they hit the DB. |
| `hireDate <= today` | `zod` schema | Future hire dates are valid in real HR systems (a signed offer for a future start). For this v1 we disallow them and document the simplification. |
| `fullName` is non-empty after trimming | `zod` schema | — |
| `jobTitle` is non-empty after trimming | `zod` schema | — |

### 2.4 What we are deliberately **not** modelling

These would belong in a real production HR system and are deliberately out of scope, per [`01-requirements-analysis.md`](01-requirements-analysis.md) §6. They are listed here so the reviewer can see the omissions are intentional, not accidental.

- **Salary history.** We model *current* salary only. A real system would have a `salary_history` table with effective-from / effective-to ranges.
- **Manager / reporting line.** A real system would have an `employee.managerId` self-reference and an org-chart view.
- **Currency.** All salaries are USD by assumption.
- **Cost centre / location (city) / office.** Useful in real HR but not required by the persona's questions.
- **Performance ratings, levels, bands.** Outside the salary-tool product surface.
- **Soft deletes / audit log.** Hard delete by assumption; no row-level audit.

---

## 3. The schema as Prisma will see it

This is the canonical schema. The Prisma file in `backend/prisma/schema.prisma` will match it exactly when we get to the implementation phase.

```prisma
model Employee {
  id              String          @id @default(cuid())
  email           String          @unique
  fullName        String          @db.VarChar(200)
  jobTitle        String          @db.VarChar(100)
  country         String          @db.Char(2)
  department      Department
  salary          Decimal         @db.Decimal(12, 2)
  employmentType  EmploymentType  @default(FULL_TIME)
  hireDate        DateTime        @db.Date
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([country])
  @@index([country, jobTitle])
  @@index([country, department])
  @@map("employees")
}

enum Department {
  ENGINEERING
  PRODUCT
  DESIGN
  SALES
  MARKETING
  CUSTOMER_SUPPORT
  FINANCE
  HR
  OPERATIONS
  LEGAL
  OTHER
}

enum EmploymentType {
  FULL_TIME
  PART_TIME
  CONTRACT
  INTERN
}
```

### 3.1 The equivalent MySQL DDL (for the reviewer)

For reviewers who would rather read SQL than Prisma:

```sql
CREATE TABLE employees (
  id              CHAR(25)                                                              NOT NULL,
  email           VARCHAR(254)                                                          NOT NULL,
  fullName        VARCHAR(200)                                                          NOT NULL,
  jobTitle        VARCHAR(100)                                                          NOT NULL,
  country         CHAR(2)                                                               NOT NULL,
  department      ENUM('ENGINEERING','PRODUCT','DESIGN','SALES','MARKETING',
                       'CUSTOMER_SUPPORT','FINANCE','HR','OPERATIONS','LEGAL','OTHER') NOT NULL,
  salary          DECIMAL(12, 2)                                                        NOT NULL,
  employmentType  ENUM('FULL_TIME','PART_TIME','CONTRACT','INTERN')                     NOT NULL DEFAULT 'FULL_TIME',
  hireDate        DATE                                                                  NOT NULL,
  createdAt       DATETIME(3)                                                           NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt       DATETIME(3)                                                           NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                                                                                ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_employees_email          (email),
  KEY        ix_employees_country        (country),
  KEY        ix_employees_country_title  (country, jobTitle),
  KEY        ix_employees_country_dept   (country, department)
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE         = utf8mb4_0900_ai_ci;
```

`utf8mb4` is non-negotiable for global names; the `ai_ci` collation is MySQL 8's default and gives us accent- and case-insensitive sorting which is what a user expects for human names.

---

## 4. Indexes — each one defended

We do not index speculatively. Every index below earns its place against a specific query that we know we will run.

| Index | Defends which query | From which feature |
|---|---|---|
| `PRIMARY KEY (id)` | Single-record reads, updates, deletes | All single-employee endpoints |
| `UNIQUE KEY (email)` | Uniqueness enforcement, lookup by email | Create-employee uniqueness check; future SSO integration |
| `KEY (country)` | Min/max/avg/median salary per country; headcount by country | F7 — required by brief |
| `KEY (country, jobTitle)` | Average salary by job title within country (the most expensive insight) | F8 — required by brief |
| `KEY (country, department)` | Headcount by country × department; filter by department within country | Q2, Journey 5 |

### 4.1 Indexes we considered and rejected

- **`KEY (jobTitle)` alone.** No endpoint queries job title without a country filter (the brief's F8 says "for the given Job Title **in a country**"). Adding the index would consume space for a query nobody runs.
- **`KEY (department)` alone.** Same reasoning — department is always combined with country.
- **Full-text index on `fullName`.** Search at 10K rows works fine with `LIKE '%term%'`; full-text is a future-perf concern, not a v1 one. Documented in [`07-performance-plan.md`](07-performance-plan.md) as a planned add at higher scale.
- **`KEY (salary)`.** Salary is filtered as a range only when other predicates already narrow the rows substantially (Journey 5 filters by department + country *first*). A salary-only index would not be used by the query planner in the workloads we have.
- **`KEY (createdAt)`.** No persona question relies on temporal ordering of employees yet. If we add the "recently joined" pill, we will add the index in the same commit.

### 4.2 The composite-index ordering rule we are following

Composite indexes are ordered **most-selective-prefix-first**. `country` always comes first in our composites because it is always the first filter clause (the brief's F7/F8) and because dropping the trailing column still lets the index serve the country-only query. Reversing the order to `(jobTitle, country)` would orphan all the country-only queries.

---

## 5. Why we are **not** introducing lookup tables

A reasonable reviewer might ask why `country`, `department`, and `jobTitle` are not three separate tables joined by foreign keys. We considered this and rejected it for each, with different reasoning.

### 5.1 `country` as a lookup table — rejected

ISO 3166-1 alpha-2 is a **universally-known, stable, externally-authoritative** standard. Storing it as a 2-character code gives us referential integrity against the ISO list without needing a `countries` table to enforce it. A `countries` table would buy us nothing (we do not store country metadata like region, currency, timezone — and if we did, we'd add it then). The `zod` schema validates against an in-memory list of valid codes; the DB stores the code itself. Less SQL, no joins, identical correctness.

### 5.2 `department` as a lookup table — rejected (in favour of an enum)

A Prisma `enum` gives us a controlled vocabulary with no extra table and no join. The DB-level `ENUM` constraint guarantees we cannot insert an unknown department. The only cost is that adding a department requires a migration — which is exactly the right amount of friction for the field.

### 5.3 `jobTitle` as a lookup table — rejected (in favour of a free string with UI autocomplete)

Job titles are emphatically *not* a controlled vocabulary in real organisations. The same role might appear as "Senior Software Engineer," "Sr. Software Engineer," "Senior SWE," and "Sr. SDE" within a single org. Forcing a closed list would make data entry painful and would either over-collapse distinct roles or over-fragment them.

Our approach:

- The field is a free string in the database.
- The create/edit UI offers **autocomplete from existing job titles in the database**, sorted by frequency. The HR Manager *can* type something new, but the most-common existing titles bubble to the top.
- The frequency-weighted autocomplete is the cheapest way to encourage consistency without forcing it.

This converges on a clean vocabulary in practice without imposing one in the schema.

---

## 6. Entity-Relationship Diagram

There is one entity. The "diagram" is straightforward.

```mermaid
erDiagram
    EMPLOYEE {
        char(25)        id PK
        varchar(254)    email UK
        varchar(200)    fullName
        varchar(100)    jobTitle
        char(2)         country
        enum            department
        decimal(12,2)   salary
        enum            employmentType
        date            hireDate
        datetime(3)     createdAt
        datetime(3)     updatedAt
    }
```

When the system grows to include `salary_history`, `manager`, or `office`, this diagram will sprout edges. For v1 it is one box, and that is the right amount of complexity.

---

## 7. Schema-evolution rules

These are the rules we will follow for every future schema change. Recording them now means there is no relitigating later.

1. **Every schema change is a Prisma migration**, generated with `prisma migrate dev`, checked in to source control, and applied in production by `prisma migrate deploy` as the release step on Railway.
2. **Migrations are forward-only**. We do not write `down` migrations. To revert, we write a new forward migration. This is the same discipline most production teams adopt and it eliminates a whole class of "the down migration didn't quite work" incidents.
3. **No destructive changes are merged without a paired data migration.** Dropping a column requires a prior backfill step; renaming a column is two migrations (`add new` → `backfill + dual-write` → `read-only old` → `drop old`).
4. **Indexes are added in their own migrations** so they can be reviewed independently of schema shape changes.
5. **The migrations directory is canonical** — `prisma migrate dev --create-only` is the right command when we want to inspect or edit the SQL before applying it.

---

## 8. How the data layer answers the persona's questions

A quick traceability check against [`02-product-thinking.md`](02-product-thinking.md):

| Persona question | Answered by |
|---|---|
| Q1 — where are our people? | `GROUP BY country` against the table; uses `ix_employees_country` |
| Q2 — country × department split | `GROUP BY country, department`; uses `ix_employees_country_dept` |
| Q3 — comp distribution in `<country>` | `SELECT salary WHERE country = ? ORDER BY salary` → percentiles computed in app code; uses `ix_employees_country` |
| Q4 — comp by job title in `<country>` | `SELECT salary WHERE country = ? AND jobTitle = ?`; uses `ix_employees_country_title` |
| Q5 — outliers | Per country-and-role, fetch salaries → compute mean + stddev in app → flag rows beyond 2σ; uses `ix_employees_country_title` |
| Q6 — org-wide summary | A handful of single-aggregate queries (`COUNT(*)`, `SUM(salary)`, `AVG(YEAR(NOW()) - YEAR(hireDate))`); no special index needed beyond what already exists |
| Q7 — find one person | `LIKE '%term%'` on `fullName` and `email`; acceptable at 10K, full-text postponed |
| Q8 — CRUD | The PK and the `email` unique constraint cover every single-row access path |

Every question maps to an index that already exists in §3 / §4. No persona question requires an index we haven't planned.

---

## 9. What we do next

With the data shape and access patterns locked, the next document — [`05-api-design.md`](05-api-design.md) — defines the HTTP contract: every endpoint, every request and response shape, the error model, the pagination and filter conventions, and how the API maps cleanly onto the entity and indexes we have just designed.
