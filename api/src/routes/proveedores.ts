import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';

const router = Router();

// GET /api/proveedores
router.get('/proveedores', async (_req, res) => {
  const items = await prisma.proveedor.findMany({ orderBy: { id: 'asc' } });
  res.json(items);
});

const ProveedorBody = z.object({
  name: z.string().min(2),
  ruc: z.string().min(8).max(15).optional(),
  phone: z.string().optional(),
});

// POST /api/proveedores
router.post('/proveedores', async (req, res) => {
  try {
    const { name, ruc, phone } = ProveedorBody.parse(req.body);

    const created = await prisma.proveedor.create({
      data: { name, ruc, phone },
    });

    res.status(201).json(created);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Validación', issues: err.issues });
    if (err.code === 'P2002')   return res.status(409).json({ error: 'El RUC ya existe' });
    console.error(err); return res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
