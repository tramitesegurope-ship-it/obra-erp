import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';

const router = Router();

// GET /api/frentes?obraId=1 (obraId opcional)
router.get('/frentes', async (req, res) => {
  const obraId = Number(req.query.obraId);
  const where = Number.isFinite(obraId) ? { obraId } : {};
  const items = await prisma.frente.findMany({ where, orderBy: { id: 'asc' } });
  res.json(items);
});

const FrenteBody = z.object({
  obraId: z.number().int().positive(),
  name: z.string().min(2),
});

// POST /api/frentes
router.post('/frentes', async (req, res) => {
  try {
    const { obraId, name } = FrenteBody.parse(req.body);

    const created = await prisma.frente.create({
      data: { obraId, name },
    });

    res.status(201).json(created);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Validación', issues: err.issues });
    console.error(err); return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
