import { Router } from 'express';
import {
  getBudgetItems,
  getBudgetSummary,
  getDailyCostReport,
  getRealCostPerformance,
} from '../services/finance/budgetReport';

const router = Router();

router.get('/finance/budget', (req, res, next) => {
  try {
    const summary = getBudgetSummary();
    const group = typeof req.query.group === 'string' ? req.query.group : undefined;
    const items = getBudgetItems({ group });
    res.json({ summary, items });
  } catch (error) {
    next(error);
  }
});

router.get('/finance/costs/daily', (_req, res, next) => {
  try {
    const report = getDailyCostReport();
    res.json(report);
  } catch (error) {
    next(error);
  }
});

router.get('/finance/performance', async (_req, res, next) => {
  try {
    const payload = await getRealCostPerformance();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
