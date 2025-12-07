import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';

const router = Router();

// Lista obras (orden determinista)
router.get('/obras', async (_req, res) => {
  const obras = await prisma.obra.findMany({ orderBy: { id: 'asc' } });
  const adjusted = obras.map(obra => {
    const name = obra.name?.toLowerCase?.() ?? '';
    if (name.includes('electrificacion huaraz') || name.includes('electrificación huaraz')) {
      return { ...obra, name: 'Proyecto La Carbonera' };
    }
    return obra;
  });
  res.json(adjusted);
});

// Valida el body de creación
const ObraBody = z.object({ name: z.string().min(2) });

router.post('/obras', async (req, res) => {
  try {
    const { name } = ObraBody.parse(req.body);
    const obra = await prisma.obra.create({ data: { name } });
    res.status(201).json(obra);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Validación', issues: err.issues });
    if (err.code === 'P2002')   return res.status(409).json({ error: 'Nombre de obra ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
