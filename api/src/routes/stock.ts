import { Router } from 'express';
import { z } from 'zod';
import { stockPorMaterial } from '../lib/stock';

const router = Router();

router.get('/stock', async (req, res) => {
  try {
    const Q = z.object({
      obraId: z.coerce.number().int().positive(),
      frenteId: z.coerce.number().int().positive().optional(),
    }).parse(req.query);

    const rows = await stockPorMaterial(Q.obraId, Q.frenteId);
    res.json(rows);
  } catch (e: any) {
    if (e.name === 'ZodError') return res.status(400).json({ error: 'Query inválida' });
    console.error(e); res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
