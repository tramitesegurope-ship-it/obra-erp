import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db'; // tu cliente Prisma


const router = Router();

/* ========= Schemas ========= */
const MoveTypeEnum = z.enum(['IN', 'OUT']);
const MoveCreate = z.object({
  obraId: z.number().int().positive(),
  frenteId: z.number().int().positive().optional().nullable(),
  materialId: z.number().int().positive(),
  proveedorId: z.number().int().positive().optional().nullable(),
  type: MoveTypeEnum,
  quantity: z.number().positive(),
  unitCost: z.number().positive().optional().nullable(), // requerido solo si IN
  date: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

const MoveUpdate = z.object({
  materialId: z.number().int().positive().optional(),
  quantity: z.number().positive().optional(),
  unitCost: z.number().nullable().optional(),       // null para OUT o si se quiere limpiar
  note: z.string().max(500).nullable().optional(),
  proveedorId: z.number().int().positive().nullable().optional(), // solo IN
});

const MaterialUpdate = z.object({
  unit: z.string().trim().min(1).nullable(), // permitir null para limpiar
});

/* ========= Helpers ========= */
async function stockPorMaterial(obraId: number, materialId: number) {
  const rows = await prisma.move.groupBy({
    by: ['obraId', 'materialId', 'type'],
    where: { obraId, materialId },
    _sum: { quantity: true },
  });
  let stock = 0;
  for (const r of rows) {
    const q = r._sum.quantity ?? 0;
    stock += r.type === 'IN' ? q : -q;
  }
  return stock;
}

async function stockDeObra(obraId: number) {
  const rows = await prisma.move.groupBy({
    by: ['obraId', 'materialId', 'type'],
    where: { obraId },
    _sum: { quantity: true },
  });
  const map = new Map<number, number>();
  for (const r of rows) {
    const q = r._sum.quantity ?? 0;
    map.set(r.materialId, (map.get(r.materialId) ?? 0) + (r.type === 'IN' ? q : -q));
  }
  return Array.from(map.entries()).map(([materialId, stock]) => ({ materialId, stock }));
}

/**
 * Verifica stock al EDITAR un movimiento OUT.
 * Considera el "reverso" del movimiento previo para no penalizar dos veces.
 *
 * - Si NO cambiamos materialId:
 *    disponible = stockActual(materialId) + oldQuantity
 * - Si SÍ cambiamos materialId:
 *    disponible en NUEVO material = stockActual(nuevoMaterialId)
 *    (porque el OUT anterior afecta al material viejo, no al nuevo)
 */
async function validarStockEnEdicionOUT(params: {
  obraId: number;
  oldMaterialId: number;
  newMaterialId: number;
  oldQty: number;
  newQty: number;
}) {
  const { obraId, oldMaterialId, newMaterialId, oldQty, newQty } = params;

  if (newMaterialId === oldMaterialId) {
    const stockActual = await stockPorMaterial(obraId, newMaterialId);
    const disponible = stockActual + oldQty; // devolvemos el OUT previo
    if (newQty > disponible) {
      throw new Error(`Stock insuficiente. Disponible: ${disponible}, solicitado: ${newQty}`);
    }
  } else {
    // Cambió el material: validamos contra el stock del nuevo material (sin sumar oldQty)
    const stockNuevo = await stockPorMaterial(obraId, newMaterialId);
    if (newQty > stockNuevo) {
      throw new Error(`Stock insuficiente en el nuevo material. Disponible: ${stockNuevo}, solicitado: ${newQty}`);
    }
  }
}

/* ========= Endpoints ========= */

// últimos movimientos (paginado simple)
router.get('/moves', async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const items = await prisma.move.findMany({
    take: limit,
    orderBy: { id: 'desc' },
  });
  res.json({ items });
});

// stock por obra
router.get('/stock', async (req, res) => {
  const obraId = Number(req.query.obraId);
  if (!obraId) return res.status(400).json({ error: 'obraId requerido' });
  const s = await stockDeObra(obraId);
  res.json(s);
});

// crear movimiento
router.post('/moves', async (req, res) => {
  const parsed = MoveCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;

  // IN requiere unitCost
  if (data.type === 'IN' && !(data.unitCost && data.unitCost > 0)) {
    return res.status(400).json({ error: 'unitCost es requerido para IN' });
  }
  // OUT ignora proveedor y unitCost
  if (data.type === 'OUT') {
    data.proveedorId = null;
    data.unitCost = null;
  }

  // validar stock para OUT
  if (data.type === 'OUT') {
    const disp = await stockPorMaterial(data.obraId, data.materialId);
    if (data.quantity > disp) {
      return res.status(400).json({ error: `Stock insuficiente. Disponible: ${disp}, solicitado: ${data.quantity}` });
    }
  }

  const created = await prisma.move.create({
    data: {
      obraId: data.obraId,
      frenteId: data.frenteId ?? null,
      materialId: data.materialId,
      proveedorId: data.proveedorId ?? null,
      type: data.type,
      quantity: data.quantity,
      unitCost: data.unitCost ?? null,
      date: data.date ? new Date(data.date) : new Date(), // fecha automática si no envían
      note: data.note ?? null,
    },
  });

  const balanceAfter = await stockPorMaterial(data.obraId, data.materialId);
  res.json({ ...created, balanceAfter });
});

// crear material si no existe
router.post('/materials', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(120),
    unit: z.string().max(20).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const name = parsed.data.name.trim();
  let mat = await prisma.material.findFirst({
  where: { name: { equals: name } },
  });


  if (!mat) {
    mat = await prisma.material.create({
      data: { name, unit: parsed.data.unit ?? null },
    });
  } else if (parsed.data.unit && !mat.unit) {
    await prisma.material.update({
      where: { id: mat.id },
      data: { unit: parsed.data.unit },
    });
    mat = await prisma.material.findUnique({ where: { id: mat.id } })!;
  }

  res.json(mat);
});

// crear proveedor si no existe
router.post('/proveedores', async (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(160) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const name = parsed.data.name.trim();
  let prov = await prisma.proveedor.findFirst({
  where: { name: { equals: name } },
  });

  if (!prov) prov = await prisma.proveedor.create({ data: { name } });
  res.json(prov);
});

/* ========= NUEVO: actualizar movimiento =========
   - Edita materialId, quantity, unitCost, note y proveedorId (solo IN).
   - Valida stock para OUT considerando el movimiento anterior.
*/
router.put('/moves/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const body = MoveUpdate.parse(req.body);

    // Movimiento actual
    const current = await prisma.move.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Movimiento no encontrado' });

    // Preparar cambios
    const newMaterialId = body.materialId ?? current.materialId;
    const newQuantity   = body.quantity   ?? current.quantity;

    // Reglas por tipo
    if (current.type === 'OUT') {
      // unitCost y proveedorId no aplican a OUT
      body.unitCost = null;
      body.proveedorId = null;

      // Validar stock para OUT (considerando el OUT previo)
      await validarStockEnEdicionOUT({
        obraId: current.obraId,
        oldMaterialId: current.materialId,
        newMaterialId,
        oldQty: current.quantity,
        newQty: newQuantity,
      });
    } else {
      // IN: unitCost puede ser null para "limpiar", pero no exigimos >0 en edición
      // proveedorId puede ser null; si no viene, no lo tocamos
    }

    const updated = await prisma.move.update({
      where: { id },
      data: {
        materialId: newMaterialId,
        quantity: newQuantity,
        unitCost: current.type === 'IN' ? (body.unitCost ?? current.unitCost ?? null) : null,
        note: body.note !== undefined ? body.note : current.note,
        proveedorId: current.type === 'IN'
          ? (body.proveedorId !== undefined ? body.proveedorId : current.proveedorId)
          : null,
      },
    });

    res.json(updated);
  } catch (e: any) {
    console.error('PUT /moves/:id error', e);
    res.status(400).json({ error: e.message });
  }
});

/* ========= NUEVO: actualizar material (unidad) ========= */
router.put('/materials/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const body = MaterialUpdate.parse(req.body);

    const updated = await prisma.material.update({
      where: { id },
      data: { unit: body.unit },
    });

    res.json(updated);
  } catch (e: any) {
    console.error('PUT /materials/:id error', e);
    res.status(400).json({ error: e.message });
  }
});

// reset total (borra movements) con clave
router.delete('/admin/reset', async (req, res) => {
  const key = req.header('X-Admin-Key');
  if (!key || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'No autorizado' });
  await prisma.move.deleteMany({});
  res.json({ ok: true });
});


// PATCH /moves/:id -> actualizar movimiento existente
router.patch('/moves/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const schema = z.object({
    materialId: z.number().int().positive().optional(),
    quantity: z.number().positive().optional(),
    unitCost: z.number().positive().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;

  try {
    const updated = await prisma.move.update({
      where: { id },
      data,
    });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
