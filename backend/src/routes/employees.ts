import { Router } from 'express';

import {
  createEmployeeInputSchema,
  listEmployeesQuerySchema,
  updateEmployeeInputSchema,
} from '@app/shared';

import * as employeesService from '../services/employees.js';

// HTTP-layer wiring for the Employee aggregate. Each handler is thin: it
// parses and validates the request through a zod schema, calls a service
// function, and formats the response. Domain logic and Prisma access live
// in services/ and repositories/ respectively
// (docs/03-architecture.md §3.2).

export const employeesRouter = Router();

// GET /api/employees - paginated, filterable, searchable, sortable list
// Contract: docs/05-api-design.md §5.1.
employeesRouter.get('/', async (req, res, next) => {
  try {
    const query = listEmployeesQuerySchema.parse(req.query);
    const result = await employeesService.list(query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/employees - create
// Contract: docs/05-api-design.md §5.2.
employeesRouter.post('/', async (req, res, next) => {
  try {
    const input = createEmployeeInputSchema.parse(req.body);
    const created = await employeesService.create(input);

    res
      .status(201)
      .set('Location', `/api/employees/${created.id}`)
      .json({ data: created });
  } catch (err) {
    next(err);
  }
});

// GET /api/employees/:id - read single
// Contract: docs/05-api-design.md §5.3. The :id segment is treated as an
// opaque key - any value that does not resolve to a row is a 404 with
// "Employee not found", never a 400 or 422.
employeesRouter.get('/:id', async (req, res, next) => {
  try {
    const employee = await employeesService.getById(req.params.id);
    res.json({ data: employee });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/employees/:id - partial update
// Contract: docs/05-api-design.md §5.4. Body may be any non-empty subset
// of the create fields with the same per-field validation; unknown fields
// are rejected by strict mode; the email field, if present, is checked
// for uniqueness against OTHER rows (self-conflict avoidance comes from
// Prisma's update naturally - the row's existing value satisfies its
// own unique constraint).
employeesRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = updateEmployeeInputSchema.parse(req.body);
    const updated = await employeesService.update(req.params.id, input);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/employees/:id - hard delete
// Contract: docs/05-api-design.md §5.5. 204 No Content on success (no
// body), 404 NOT_FOUND on miss with the standard error envelope.
employeesRouter.delete('/:id', async (req, res, next) => {
  try {
    await employeesService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
