import { Router } from 'express';

import { countryStatsQuerySchema } from '@app/shared';

import * as insightsService from '../services/insights.js';

// HTTP-layer wiring for the insights endpoints. Each handler is thin: it
// parses and validates the query through a zod schema, calls a service
// function, and formats the response. Domain logic and DB access live in
// services/ and repositories/ respectively (docs/03-architecture.md §3.2).

export const insightsRouter = Router();

// GET /api/insights/country-stats - per-country distributional stats
// Contract: docs/05-api-design.md §6.2.
insightsRouter.get('/country-stats', async (req, res, next) => {
  try {
    const query = countryStatsQuerySchema.parse(req.query);
    const data = await insightsService.getCountryStats(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
