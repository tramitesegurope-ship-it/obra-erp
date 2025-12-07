import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';

const router = Router();

const GroupPayload = z.object({
  name: z.string().min(2).max(80),
  parentId: z.number().int().positive().optional().nullable(),
  color: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
    .optional()
    .nullable(),
});

router.get('/material-groups', async (_req, res) => {
  const items = await prisma.materialGroup.findMany({
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
  });
  res.json({ items });
});

router.post('/material-groups', async (req, res) => {
  const parsed = GroupPayload.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const created = await prisma.materialGroup.create({
      data: {
        name: parsed.data.name.trim(),
        parentId: parsed.data.parentId ?? null,
        color: parsed.data.color ?? null,
      },
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un grupo con ese nombre' });
    }
    if (error?.code === 'P2003') {
      return res.status(400).json({ error: 'El grupo padre no existe' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.patch('/material-groups/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const parsed = GroupPayload.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const updated = await prisma.materialGroup.update({
      where: { id },
      data: {
        name: parsed.data.name?.trim(),
        parentId:
          parsed.data.parentId !== undefined ? parsed.data.parentId ?? null : undefined,
        color: parsed.data.color ?? undefined,
      },
    });
    res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un grupo con ese nombre' });
    }
    if (error?.code === 'P2003' || error?.code === 'P2025') {
      return res.status(400).json({ error: 'El grupo padre es inválido o el grupo no existe' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.delete('/material-groups/:id', requireAdminDeleteKey, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const dependants = await prisma.material.count({ where: { groupId: id } });
    if (dependants > 0) {
      return res.status(409).json({
        error: 'Grupo en uso',
        detail: 'No puedes eliminar el grupo mientras tenga materiales asignados.',
      });
    }
    const children = await prisma.materialGroup.count({ where: { parentId: id } });
    if (children > 0) {
      return res.status(409).json({
        error: 'Grupo con subgrupos',
        detail: 'Mueve o elimina los subgrupos antes de eliminar este grupo.',
      });
    }
    await prisma.materialGroup.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
