import { Router } from 'express';

import { jobTitlesQuerySchema } from '@app/shared';

import * as insightsService from '../services/insights.js';

// Mounted at /api/job-titles (not /api/insights/job-titles) because this is
// a form-support utility, not a metric. Contract: docs/05-api-design.md §5.6.
//
// The service function lives in services/insights.ts because the underlying
// query is just another GROUP BY against the employees table; co-locating
// it with the other aggregations avoids a single-function service file.

export const jobTitlesRouter = Router();

jobTitlesRouter.get('/', async (req, res, next) => {
  try {
    const query = jobTitlesQuerySchema.parse(req.query);
    const data = await insightsService.getJobTitles(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});
