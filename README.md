# WEB URL : https://employee-salary-analytics-frontend.vercel.app

# Employee Salary Analytics

A minimal, production-quality salary management tool for HR Managers of mid-to-large organizations (10,000+ employees). Built as a take-home assessment.

## What this project is

An end-to-end web application that lets an HR Manager:

- Manage employees (add, view, update, delete) through a clean UI.
- Explore salary insights — min / max / average / median salary by country, average compensation by job title within a country, headcount distribution, and outlier detection.
- Work confidently with realistic data volume — the system is designed and tested against a seeded population of 10,000 employees.

The goal is not just "a working CRUD app." The goal is to demonstrate clear product thinking, sound architectural decisions, disciplined engineering, and intentional use of AI tooling — the same way we'd ship a real internal tool.

## Who this is for

**Primary user:** HR Manager of an organization with ~10,000 employees.

The HR Manager needs to answer questions like:
- *"Are we paying our Senior Engineers in Germany competitively?"*
- *"Which countries have the widest salary spread for the same role?"*
- *"Who are the outliers in compensation, and is that intentional?"*

Every feature in this app is justified against that persona. The detailed user-journey rationale lives in [docs/02-product-thinking.md](docs/02-product-thinking.md).

## Approach

This project is being built in two clearly-separated phases, both visible in the commit history:

1. **Planning phase (docs first).** Before any code is written, the repository captures requirements analysis, product thinking, architecture, data model, API design, TDD strategy, performance plan, and trade-off rationale as a sequence of Markdown documents. This is intentional — the assessment evaluates *how* we think, not just *what* we ship.

2. **Implementation phase (strict TDD).** Each feature is then built using Test-Driven Development:
   - Commit a **failing test** that describes the desired behavior (red).
   - Commit the **minimum implementation** that makes it pass (green).
   - Commit a **refactor** when there is something meaningful to clean up.

   TDD is applied strictly to business logic (services, aggregations, route handlers). It is applied pragmatically to boilerplate (tsconfig, server bootstrap, type definitions) — the rationale is documented in [docs/06-tdd-strategy.md](docs/06-tdd-strategy.md).

The result is a commit history that reads as a narrative: you can see the problem being understood, the design taking shape, and the code being grown one test at a time.

## Stack at a glance

| Layer       | Choice                                              |
|-------------|-----------------------------------------------------|
| Backend     | Node.js · TypeScript · Express · Prisma             |
| Database    | MySQL 8 (Docker Compose locally · Railway in prod)  |
| Frontend    | React · Vite · TypeScript · Tailwind · shadcn/ui    |
| Testing     | Vitest · Supertest                                  |
| Deployment  | Vercel (frontend) · Railway (backend + MySQL)       |

The full rationale for each choice — including what was considered and rejected — is captured in [docs/08-tradeoffs.md](docs/08-tradeoffs.md).

## Planning artifacts

The `docs/` directory contains the design documents that drove this implementation. They are intended to be read in order:

1. [`docs/01-requirements-analysis.md`](docs/01-requirements-analysis.md) — Restating the brief, surfacing implicit requirements, listing assumptions.
2. [`docs/02-product-thinking.md`](docs/02-product-thinking.md) — Persona, user journeys, rationale for additional metrics.
3. [`docs/03-architecture.md`](docs/03-architecture.md) — System diagram, component boundaries, request flow.
4. [`docs/04-data-model.md`](docs/04-data-model.md) — Employee schema, field rationale, indexes, ERD.
5. [`docs/05-api-design.md`](docs/05-api-design.md) — Endpoint contracts, error model, pagination strategy.
6. [`docs/06-tdd-strategy.md`](docs/06-tdd-strategy.md) — Test pyramid, tooling, red-green-refactor flow.
7. [`docs/07-performance-plan.md`](docs/07-performance-plan.md) — Seed-script strategy and query performance.
8. [`docs/08-tradeoffs.md`](docs/08-tradeoffs.md) — Decisions log: what was chosen, what was rejected, why.
9. [`docs/09-ai-usage.md`](docs/09-ai-usage.md) — How AI tooling accelerated the work and where it was overridden.
10. [`docs/10-deployment.md`](docs/10-deployment.md) — How the app is deployed and how to reproduce the environment.

> These documents are added incrementally during the planning phase of the commit history.

## Running locally

> Setup instructions will be added as the corresponding scaffolding commits land. The intended flow is:
>
> 1. `docker compose up -d` — boot MySQL.
> 2. `cd backend && npm install && npm run prisma:migrate && npm run seed`
> 3. `cd backend && npm run dev`
> 4. `cd frontend && npm install && npm run dev`
>
> A single command-line walkthrough will be documented in this section once implementation begins.

## Demo

> A short video walkthrough of the deployed application will be linked here once the build is complete.

## Repository status

**Current phase:** Planning. The repository contains only design and planning documents. Implementation commits begin once the planning phase is complete.
