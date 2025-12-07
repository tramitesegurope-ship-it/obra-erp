// api/src/routes/materials.ts
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { Prisma, AssetStatus } from '@prisma/client';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';

const router = Router();

/* ========== Schemas ========== */
const MaterialCreate = z.object({
  name: z.string().min(2, 'Nombre muy corto'),
  unit: z.string().min(1).optional().nullable(),
  code: z.string().min(1).optional().nullable(), // si lo usas como único
  isCompanyAsset: z.boolean().optional(),
  groupId: z.number().int().positive().optional().nullable(),
  minStock: z.number().min(0).optional(),
  reorderQuantity: z.number().min(0).optional(),
  allowNegative: z.boolean().optional(),
});

const MaterialUpdate = z.object({
  name: z.string().min(2).optional(),
  unit: z.string().min(1).optional().nullable(),
  code: z.string().min(1).optional().nullable(),
  isCompanyAsset: z.boolean().optional(),
  assetResponsible: z.string().max(120).optional().nullable(),
  groupId: z.number().int().positive().optional().nullable(),
  minStock: z.number().min(0).optional(),
  reorderQuantity: z.number().min(0).optional(),
  allowNegative: z.boolean().optional(),
});

/* ========== Helpers ========== */
// Búsqueda “case-insensitive” compatible con SQLite
async function findMaterialByNameInsensitive(name: string) {
  const exact = await prisma.material.findFirst({ where: { name } });
  if (exact) return exact;

  const prefix = name.slice(0, Math.min(3, name.length));
  const candidates = await prisma.material.findMany({
    where: prefix ? { name: { contains: prefix } } : undefined,
    take: 50,
  });
  const nameNorm = name.toLowerCase();
  return candidates.find(m => m.name.toLowerCase() === nameNorm) ?? null;
}

/* ========== Rutas ========== */

// GET /materials -> lista
router.get('/materials', async (_req, res) => {
  const items = await prisma.material.findMany({
    orderBy: { name: 'asc' },
    include: { group: true },
  });
  res.json(items);
});

// GET /materials/:id -> detalle
router.get('/materials/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  const mat = await prisma.material.findUnique({ where: { id } });
  if (!mat) return res.status(404).json({ error: 'No encontrado' });
  const material = await prisma.material.findUnique({
    where: { id },
    include: { group: true },
  });
  res.json(material);
});

// POST /materials -> crear (o devolver existente por nombre, insensible)
router.post('/materials', async (req, res) => {
  const parsed = MaterialCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });

    const { name, unit, code, groupId, minStock, reorderQuantity, allowNegative } = parsed.data;
    try {
      // evitar duplicados por nombre (insensible)
      const existingByName = await findMaterialByNameInsensitive(name.trim());
      if (existingByName) {
        // si viene unit y el existente no la tiene, actualizamos
      if (unit && !existingByName.unit) {
        const updated = await prisma.material.update({
          where: { id: existingByName.id },
          data: { unit },
        });
        const withGroup = await prisma.material.findUnique({
          where: { id: updated.id },
          include: { group: true },
        });
        return res.status(200).json(withGroup);
      }
      const existing = await prisma.material.findUnique({
        where: { id: existingByName.id },
        include: { group: true },
      });
      return res.status(200).json(existing);
    }

    const created = await prisma.material.create({
      data: {
        name: name.trim(),
        unit: unit ?? null,
        code: code ?? null,
        isCompanyAsset: parsed.data.isCompanyAsset ?? false,
        assetStatus: AssetStatus.IN_WAREHOUSE,
        groupId: groupId ?? null,
        minStock: new Prisma.Decimal(minStock ?? 0),
        reorderQuantity: new Prisma.Decimal(reorderQuantity ?? 0),
        allowNegative: allowNegative ?? false,
      },
      include: { group: true },
    });
    return res.status(201).json(created);
  } catch (err: any) {
    // P2002 -> unique constraint (por ejemplo code único)
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado: ya existe un material con ese code' });
    }
    if (err?.code === 'P2003') {
      return res.status(400).json({ error: 'Grupo inválido: verifica materialGroupId' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// PATCH /materials/:id -> actualización parcial (p.ej. unit)
router.patch('/materials/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  const parsed = MaterialUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });

  try {
    const exists = await prisma.material.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ error: 'No encontrado' });

    // si viene name, evitamos duplicado “case-insensitive” con otro id
    if (parsed.data.name) {
      const dup = await findMaterialByNameInsensitive(parsed.data.name.trim());
      if (dup && dup.id !== id) {
        return res.status(409).json({ error: 'Ya existe otro material con ese nombre' });
      }
    }

    const updateData: Prisma.MaterialUpdateInput = {
      name: parsed.data.name?.trim(),
      unit: parsed.data.unit ?? undefined,
      code: parsed.data.code ?? undefined,
    };
    if (parsed.data.isCompanyAsset !== undefined) {
      updateData.isCompanyAsset = parsed.data.isCompanyAsset;
      updateData.assetStatus = parsed.data.isCompanyAsset
        ? exists.assetStatus ?? AssetStatus.IN_WAREHOUSE
        : AssetStatus.IN_WAREHOUSE;
      if (!parsed.data.isCompanyAsset) {
        updateData.assetResponsible = null;
      }
    }
    if (parsed.data.assetResponsible !== undefined) {
      updateData.assetResponsible = parsed.data.assetResponsible?.trim() || null;
    }
    if (parsed.data.groupId !== undefined) {
      updateData.group = parsed.data.groupId
        ? { connect: { id: parsed.data.groupId } }
        : { disconnect: true };
    }
    if (parsed.data.minStock !== undefined) {
      updateData.minStock = new Prisma.Decimal(parsed.data.minStock);
    }
    if (parsed.data.reorderQuantity !== undefined) {
      updateData.reorderQuantity = new Prisma.Decimal(parsed.data.reorderQuantity);
    }
    if (parsed.data.allowNegative !== undefined) {
      updateData.allowNegative = parsed.data.allowNegative;
    }

    const updated = await prisma.material.update({
      where: { id },
      data: updateData,
      include: { group: true },
    });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado: code ya existe' });
    }
    if (err?.code === 'P2003' || err?.code === 'P2025') {
      return res.status(400).json({ error: 'Grupo inválido o no encontrado' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.delete('/materials/:id', requireAdminDeleteKey, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  try {
    const exists = await prisma.material.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ error: 'No encontrado' });

    const moveCount = await prisma.move.count({ where: { materialId: id } });
    const expenseCount = await prisma.expense.count({ where: { materialId: id } });
    if (moveCount > 0 || expenseCount > 0) {
      return res.status(409).json({
        error: 'Material en uso',
        detail: 'No se puede eliminar porque tiene movimientos o gastos asociados.',
      });
    }

    await prisma.material.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
