import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';

const router = Router();

router.get('/kardex/:materialId', async (req, res) => {
  try {
    const P = z.object({ materialId: z.coerce.number().int().positive() }).parse(req.params);
    const Q = z.object({
      obraId: z.coerce.number().int().positive(),
      frenteId: z.coerce.number().int().positive().optional(),
    }).parse(req.query);

    const where: any = { obraId: Q.obraId, materialId: P.materialId };
    if (Q.frenteId) where.frenteId = Q.frenteId;

    const material = await prisma.material.findUnique({ where: { id: P.materialId } });
    if (!material) return res.status(404).json({ error: 'Material no existe' });

    const moves = await prisma.move.findMany({
      where, orderBy: { date: 'asc' },
      select: { id:true, date:true, type:true, quantity:true, unitCost:true, note:true }
    });

    let balance = 0;
    const ledger = moves.map(m => {
      balance += m.type === 'IN' ? m.quantity : -m.quantity;
      return { ...m, balanceAfter: balance };
    });

    res.json({ material: { id: material.id, name: material.name, unit: material.unit, code: material.code }, ledger });
  } catch (e: any) {
    if (e.name === 'ZodError') return res.status(400).json({ error: 'Parámetros inválidos' });
    console.error(e); res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
