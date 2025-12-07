import { Router } from 'express';
import { z } from 'zod';
import { stockPorMaterial } from '../lib/stock';

const router = Router();

router.get('/stock', async (req, res) => {
  try {
    const Q = z.object({
      obraId: z.coerce.number().int().positive(),
      frenteId: z.coerce.number().int().positive().optional(),
      groupId: z.coerce.number().int().positive().optional(),
      includeDescendants: z
        .enum(['true', 'false'])
        .optional()
        .transform(value => (value === undefined ? true : value === 'true')),
    }).parse(req.query);

    const rows = await stockPorMaterial(Q.obraId, Q.frenteId, {
      groupId: Q.groupId,
      includeDescendants: Q.includeDescendants,
    });
    res.json(rows);
  } catch (e: any) {
    if (e.name === 'ZodError') return res.status(400).json({ error: 'Query inválida' });
    console.error(e); res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
