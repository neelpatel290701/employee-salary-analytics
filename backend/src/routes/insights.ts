import { Router } from 'express';

import {
  countryStatsQuerySchema,
  headcountQuerySchema,
  jobTitleStatsQuerySchema,
  outliersQuerySchema,
} from '@app/shared';

import * as insightsService from '../services/insights.js';

// HTTP-layer wiring for the insights endpoints. Each handler is thin: it
// parses and validates the query through a zod schema, calls a service
// function, and formats the response. Domain logic and DB access live in
// services/ and repositories/ respectively (docs/03-architecture.md §3.2).

export const insightsRouter = Router();

// GET /api/insights/summary - org-wide top-line snapshot
// Contract: docs/05-api-design.md §6.1.
insightsRouter.get('/summary', async (_req, res, next) => {
  try {
    const data = await insightsService.getSummary();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

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

// GET /api/insights/job-title-stats - per-(country, jobTitle) stats
// Contract: docs/05-api-design.md §6.3.
insightsRouter.get('/job-title-stats', async (req, res, next) => {
  try {
    const query = jobTitleStatsQuerySchema.parse(req.query);
    const data = await insightsService.getJobTitleStats(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/insights/headcount - counts by country or country × department
// Contract: docs/05-api-design.md §6.4.
insightsRouter.get('/headcount', async (req, res, next) => {
  try {
    const query = headcountQuerySchema.parse(req.query);
    const data = await insightsService.getHeadcount(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/insights/outliers - employees > 2σ from their (country, jobTitle)
// cohort mean. Contract: docs/05-api-design.md §6.5.
insightsRouter.get('/outliers', async (req, res, next) => {
  try {
    const query = outliersQuerySchema.parse(req.query);
    const data = await insightsService.getOutliers(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
