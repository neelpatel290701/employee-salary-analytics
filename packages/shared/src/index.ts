// @app/shared - the single source of truth for zod schemas, inferred
// TypeScript types, and small pure helpers shared between backend and
// frontend.
//
// Per docs/06-tdd-strategy.md §6, exports here grow one commit pair at a
// time as new schemas land under the TDD discipline.

export * from './schemas/employee.js';
export * from './data/iso-countries.js';
