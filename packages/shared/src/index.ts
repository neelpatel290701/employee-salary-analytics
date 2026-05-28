// @app/shared — single source of truth for zod schemas, inferred TypeScript
// types, and small pure helpers that both the backend and the frontend
// consume.
//
// The schemas, types, and helpers themselves are added one at a time during
// the TDD implementation phase, with a failing test landing before any
// schema is created. See docs/06-tdd-strategy.md §6 for the cadence.
//
// This file deliberately starts empty so the workspace can resolve before
// any production code exists.

export {};
