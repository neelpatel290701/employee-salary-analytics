import { Router } from 'express';

import { createEmployeeInputSchema } from '@app/shared';

import * as employeesService from '../services/employees.js';

// HTTP-layer wiring for the Employee aggregate. Each handler is thin: it
// parses and validates the request through a zod schema, calls a service
// function, and formats the response. Domain logic and Prisma access live
// in services/ and repositories/ respectively
// (docs/03-architecture.md §3.2).

export const employeesRouter = Router();

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
