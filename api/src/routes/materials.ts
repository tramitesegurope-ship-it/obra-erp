// api/src/routes/materials.ts
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';

const router = Router();

/* ========== Schemas ========== */
const MaterialCreate = z.object({
  name: z.string().min(2, 'Nombre muy corto'),
  unit: z.string().min(1).optional().nullable(),
  code: z.string().min(1).optional().nullable(), // si lo usas como único
});

const MaterialUpdate = z.object({
  name: z.string().min(2).optional(),
  unit: z.string().min(1).optional().nullable(),
  code: z.string().min(1).optional().nullable(),
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
  const items = await prisma.material.findMany({ orderBy: { id: 'asc' } });
  res.json(items);
});

// GET /materials/:id -> detalle
router.get('/materials/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  const mat = await prisma.material.findUnique({ where: { id } });
  if (!mat) return res.status(404).json({ error: 'No encontrado' });
  res.json(mat);
});

// POST /materials -> crear (o devolver existente por nombre, insensible)
router.post('/materials', async (req, res) => {
  const parsed = MaterialCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });

  const { name, unit, code } = parsed.data;
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
        return res.status(200).json(updated);
      }
      return res.status(200).json(existingByName);
    }

    const created = await prisma.material.create({
      data: { name: name.trim(), unit: unit ?? null, code: code ?? null },
    });
    return res.status(201).json(created);
  } catch (err: any) {
    // P2002 -> unique constraint (por ejemplo code único)
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado: ya existe un material con ese code' });
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

    const updated = await prisma.material.update({
      where: { id },
      data: {
        name: parsed.data.name?.trim(),
        unit: parsed.data.unit ?? undefined,
        code: parsed.data.code ?? undefined,
      },
    });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado: code ya existe' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
