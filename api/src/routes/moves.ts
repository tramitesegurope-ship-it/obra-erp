import { Router } from 'express';
import { z } from 'zod';
import {
  Prisma,
  ExpenseKind,
  DocType as PrismaDocType,
  MoveType as PrismaMoveType,
  AssetStatus,
} from '@prisma/client';
import prisma from '../db';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';

const router = Router();

const normalizeSearchValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const buildSearchTokens = (input: Array<string | number | undefined | null>) => {
  const tokens: string[] = [];
  for (const value of input) {
    if (value === undefined || value === null) continue;
    const text =
      typeof value === 'number' ? String(value) : String(value ?? '').trim();
    if (!text) continue;
    tokens.push(normalizeSearchValue(text));
  }
  return tokens;
};

const searchMatches = (
  move: Prisma.MoveGetPayload<{
    include: {
      material: { select: { name: true; code: true } };
      proveedor: { select: { name: true } };
      obra: { select: { name: true } };
      frente: { select: { name: true } };
    };
  }>,
  normalizedTerm: string,
) => {
  const values = buildSearchTokens([
    move.note,
    move.docSerie,
    move.docNumero,
    move.responsible,
    move.type,
    move.id,
    move.materialId,
    move.material?.name,
    move.material?.code,
    move.proveedor?.name,
    move.obra?.name,
    move.frente?.name,
  ]);
  return values.some((token) => token.includes(normalizedTerm));
};

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
  docType: z.enum(['FACTURA', 'BOLETA', 'RECIBO', 'OTRO']).optional().nullable(),
  docSerie: z.string().max(12).optional().nullable(),
  docNumero: z.string().max(20).optional().nullable(),
  isTaxable: z.boolean().optional(),
  igvRate: z.number().min(0).max(1).optional(),
  responsible: z.string().min(3).max(120).optional().nullable(),
});

const MoveUpdate = z.object({
  materialId: z.number().int().positive().optional(),
  quantity: z.number().positive().optional(),
  unitCost: z.number().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  proveedorId: z.number().int().positive().nullable().optional(),
  docSerie: z.string().max(12).nullable().optional(),
  docNumero: z.string().max(20).nullable().optional(),
  docType: z.enum(['FACTURA', 'BOLETA', 'RECIBO', 'OTRO']).optional().nullable(),
  isTaxable: z.boolean().optional(),
  igvRate: z.number().min(0).max(1).optional(),
  responsible: z.string().min(3).max(120).nullable().optional(),
});

const MaterialUpdate = z.object({
  unit: z.string().trim().min(1).nullable(),
});

/* ========= Helpers ========= */
const CATEGORY_COMPRAS = 'Materiales — Compras';
const CATEGORY_CONSUMO = 'Materiales — Consumo obra';
const DEFAULT_IGV = 0.18;
const DEFAULT_FRENTE_NAME = 'Frente Centro';

type Tx = Prisma.TransactionClient;

const round2 = (value: number) => Math.round(value * 100) / 100;
const getClient = (tx?: Tx) => tx ?? prisma;

async function stockPorMaterial(obraId: number, materialId: number, tx?: Tx) {
  const client = getClient(tx);
  const rows = await client.move.groupBy({
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
    const rows = await prisma.move.findMany({
      where: { obraId },
      include: { material: true },
      orderBy: { date: 'asc' },
    });
    const map = new Map<number, number>();
    for (const row of rows) {
      const qty = row.quantity ?? 0;
      map.set(row.materialId, (map.get(row.materialId) ?? 0) + (row.type === PrismaMoveType.IN ? qty : -qty));
    }
    return Array.from(map.entries()).map(([materialId, stock]) => ({ materialId, stock }));
}

async function validarStockEnEdicionOUT(params: {
  obraId: number;
  oldMaterialId: number;
  newMaterialId: number;
  oldQty: number;
  newQty: number;
}) {
  const { obraId, oldMaterialId, newMaterialId, oldQty, newQty } = params;

  const material = await prisma.material.findUnique({ where: { id: newMaterialId } });
  if (!material) {
    throw new Error('Material no encontrado al validar stock');
  }
  const allowNegative = material.allowNegative ?? false;

  if (newMaterialId === oldMaterialId) {
    const stockActual = await stockPorMaterial(obraId, newMaterialId);
    const disponible = stockActual + oldQty;
    if (!allowNegative && newQty > disponible) {
      throw new Error(
        `Stock insuficiente. Disponible: ${round2(disponible)}, solicitado: ${round2(newQty)}`,
      );
    }
  } else {
    const stockNuevo = await stockPorMaterial(obraId, newMaterialId);
    if (!allowNegative && newQty > stockNuevo) {
      throw new Error(
        `Stock insuficiente en el nuevo material. Disponible: ${round2(stockNuevo)}, solicitado: ${round2(newQty)}`,
      );
    }
  }
}

async function ensureCategory(tx: Tx, kind: ExpenseKind, name: string) {
  const existing = await tx.expenseCategory.findFirst({ where: { name } });
  if (existing) {
    if (existing.kind !== kind) {
      return tx.expenseCategory.update({
        where: { id: existing.id },
        data: { kind },
      });
    }
    return existing;
  }
  return tx.expenseCategory.create({ data: { name, kind } });
}

async function getDefaultFrenteId(tx: Tx, obraId: number) {
  const frente = await tx.frente.findFirst({
    where: { obraId, name: DEFAULT_FRENTE_NAME },
  });
  if (frente) return frente.id;
  const fallback = await tx.frente.findFirst({
    where: { obraId },
    orderBy: { id: 'asc' },
  });
  return fallback?.id ?? null;
}

async function lastPurchaseCost(tx: Tx, obraId: number, materialId: number) {
  const last = await tx.move.findFirst({
    where: { obraId, materialId, type: PrismaMoveType.IN },
    orderBy: { date: 'desc' },
    select: { unitCost: true },
  });
  return last?.unitCost ?? 0;
}

async function calcularValorInventario(tx: Tx, obraId: number, materialId: number) {
  const [ins, outs] = await Promise.all([
    tx.move.findMany({
      where: { obraId, materialId, type: PrismaMoveType.IN },
      select: { quantity: true, unitCost: true, totalCost: true },
    }),
    tx.move.findMany({
      where: { obraId, materialId, type: PrismaMoveType.OUT },
      select: { quantity: true, unitCost: true, totalCost: true },
    }),
  ]);

  const sumRows = (rows: typeof ins) =>
    rows.reduce(
      (acc, row) => {
        const qty = row.quantity ?? 0;
        const total = row.totalCost ?? (row.unitCost ? row.unitCost * qty : 0);
        return {
          qty: acc.qty + qty,
          cost: acc.cost + total,
        };
      },
      { qty: 0, cost: 0 },
    );

  const tIn = sumRows(ins);
  const tOut = sumRows(outs);

  const qty = round2(tIn.qty - tOut.qty);
  const cost = round2(tIn.cost - tOut.cost);
  const avg = qty > 0 ? round2(cost / qty) : 0;

  return { qty, cost, avg };
}

async function buildPurchaseExpenseData(params: {
  docType: PrismaDocType;
  isTaxable: boolean;
  igvRate: number;
  quantity: number;
  unitCost: number;
}) {
  const total = round2(params.quantity * params.unitCost);
  const base = params.isTaxable ? round2(total / (1 + params.igvRate)) : total;
  const igv = params.isTaxable ? round2(total - base) : 0;
  return { total, base, igv };
}

async function syncExpenseForMove(moveId: number) {
  const move = await prisma.move.findUnique({
    where: { id: moveId },
    include: { expense: true },
  });
  if (!move) return;

  if (move.type === 'IN') {
    if (!move.unitCost || move.unitCost <= 0) return;
    const docType = move.docType ?? PrismaDocType.FACTURA;
    const isTaxable = docType === PrismaDocType.FACTURA ? move.isTaxable ?? true : false;
    const igvRate = isTaxable ? Number(move.igvRate ?? DEFAULT_IGV) : 0;
    const { total, base, igv } = await buildPurchaseExpenseData({
      docType,
      isTaxable,
      igvRate,
      quantity: move.quantity,
      unitCost: move.unitCost,
    });

    await prisma.move.update({
      where: { id: move.id },
      data: { totalCost: total, igvRate, isTaxable },
    });

    if (move.expense) {
      await prisma.expense.update({
        where: { id: move.expense.id },
        data: {
          quantity: move.quantity,
          unitCost: move.unitCost,
          base,
          igv,
          total,
          igvRate,
          isTaxable,
        },
      });
    }
    return;
  }

  // OUT
  const valuation = await calcularValorInventario(prisma, move.obraId, move.materialId);
  const unitCost = move.unitCost ?? valuation.avg ?? (await lastPurchaseCost(prisma, move.obraId, move.materialId));
  const total = round2(unitCost * move.quantity);

  await prisma.move.update({
    where: { id: move.id },
    data: { unitCost: unitCost || null, totalCost: total || null },
  });

  if (move.expense) {
    await prisma.expense.update({
      where: { id: move.expense.id },
      data: {
        quantity: move.quantity,
        unitCost: unitCost || null,
        base: total || 0,
        total: total || 0,
      },
    });
  }
}

/* ========= Endpoints ========= */

// últimos movimientos
router.get('/moves', async (req, res) => {
  const rawLimit = Number(req.query.limit ?? 200);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 2000) : 200;

  const baseWhere: Prisma.MoveWhereInput = {};

  const obraId = Number(req.query.obraId);
  if (Number.isFinite(obraId) && obraId > 0) {
    baseWhere.obraId = obraId;
  }

  const typeParam =
    typeof req.query.type === 'string' ? req.query.type.toUpperCase() : '';
  if (typeParam === 'IN' || typeParam === 'OUT') {
    baseWhere.type = typeParam as PrismaMoveType;
  }

  const dateFilter: Prisma.DateTimeFilter = {};
  const fromParam =
    typeof req.query.from === 'string' ? new Date(req.query.from) : null;
  if (fromParam && !Number.isNaN(fromParam.getTime())) {
    dateFilter.gte = fromParam;
  }
  const toParam =
    typeof req.query.to === 'string' ? new Date(req.query.to) : null;
  if (toParam && !Number.isNaN(toParam.getTime())) {
    dateFilter.lte = toParam;
  }
  if (Object.keys(dateFilter).length > 0) {
    baseWhere.date = dateFilter;
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (!search) {
    const items = await prisma.move.findMany({
      take: limit,
      orderBy: { id: 'desc' },
      where: baseWhere,
    });
    res.json({ items });
    return;
  }

  const normalizedTerm = normalizeSearchValue(search);
  const batchSize = Math.max(limit * 2, 400);
  const maxBatches = 20;
  const include = {
    material: { select: { name: true, code: true } },
    proveedor: { select: { name: true } },
    obra: { select: { name: true } },
    frente: { select: { name: true } },
  };
  const matches: Prisma.MoveGetPayload<{ include: typeof include }>[] = [];
  let cursor: { id: number } | undefined;

  for (let i = 0; i < maxBatches && matches.length < limit; i += 1) {
    const batch = await prisma.move.findMany({
      take: batchSize,
      orderBy: { id: 'desc' },
      where: baseWhere,
      include,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    for (const row of batch) {
      if (searchMatches(row, normalizedTerm)) {
        matches.push(row);
        if (matches.length >= limit) break;
      }
    }
    const lastRow = batch[batch.length - 1];
    cursor = { id: lastRow.id };
    if (batch.length < batchSize) break;
  }

  const sanitized = matches.map(({ material, proveedor, obra, frente, ...rest }) => rest);
  res.json({ items: sanitized });
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
  const material = await prisma.material.findUnique({ where: { id: data.materialId } });
  if (!material) {
    return res.status(404).json({ error: 'Material no encontrado' });
  }

  if (data.type === 'OUT') {
    const disp = await stockPorMaterial(data.obraId, data.materialId);
    const projected = disp - data.quantity;
    if (!material.allowNegative && data.quantity > disp) {
      return res
        .status(400)
        .json({ error: `Stock insuficiente. Disponible: ${round2(disp)}, solicitado: ${round2(data.quantity)}` });
    }
    if (material.isCompanyAsset && (!data.responsible || !data.responsible.trim())) {
      return res
        .status(400)
        .json({ error: 'Debes indicar el responsable de la salida de este activo.' });
    }
    if (!material.allowNegative && projected < 0) {
      return res
        .status(400)
        .json({ error: 'La salida dejaría el stock en negativo y el material no lo permite.' });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const fecha = data.date ? new Date(data.date) : new Date();
      const frenteId = data.frenteId ?? (await getDefaultFrenteId(tx, data.obraId));
      const materialRow = await tx.material.findUnique({ where: { id: data.materialId } });
      const isAsset = materialRow?.isCompanyAsset ?? false;
      const responsibleName = data.responsible?.trim() || null;

      if (data.type === 'IN') {
        const rawDocType = data.docType as PrismaDocType | null | undefined;
        const docType = rawDocType ?? PrismaDocType.FACTURA;
        const hasCost = typeof data.unitCost === 'number' && data.unitCost > 0;
        const isTaxable =
          hasCost && docType === PrismaDocType.FACTURA ? data.isTaxable ?? true : false;
        const igvRate = hasCost && isTaxable ? data.igvRate ?? DEFAULT_IGV : 0;

        let purchase: { total: number; base: number; igv: number } | null = null;
        if (hasCost) {
          purchase = await buildPurchaseExpenseData({
            docType,
            isTaxable,
            igvRate,
            quantity: data.quantity,
            unitCost: data.unitCost!,
          });
        }

        const moveResponsible = isAsset ? responsibleName ?? materialRow?.assetResponsible ?? null : responsibleName;
        const moveAssetStatus = isAsset ? AssetStatus.IN_WAREHOUSE : null;

        const move = await tx.move.create({
          data: {
            obraId: data.obraId,
            frenteId,
            materialId: data.materialId,
            proveedorId: data.proveedorId ?? null,
            type: PrismaMoveType.IN,
            quantity: data.quantity,
            unitCost: hasCost ? data.unitCost! : null,
            totalCost: purchase ? purchase.total : null,
            date: fecha,
            note: data.note ?? null,
            docType,
            docSerie: data.docSerie?.trim().toUpperCase() || null,
            docNumero: data.docNumero?.trim() || null,
            igvRate: hasCost ? igvRate : 0,
            isTaxable: hasCost ? isTaxable : false,
            responsible: moveResponsible,
            assetStatus: moveAssetStatus,
          },
        });

        if (hasCost && purchase) {
          const category = await ensureCategory(tx, ExpenseKind.MATERIAL_COMPRA, CATEGORY_COMPRAS);

          const expense = await tx.expense.create({
            data: {
              obraId: data.obraId,
              frenteId,
              proveedorId: data.proveedorId ?? null,
              materialId: data.materialId,
              categoryId: category.id,
              moveId: move.id,
              docType,
              docSerie: move.docSerie,
              docNumero: move.docNumero,
              date: fecha,
              description:
                data.note ??
                `Compra de material (movimiento #${move.id})`,
              type: 'DIRECTO',
              variableType: 'VARIABLE',
              quantity: data.quantity,
              unitCost: data.unitCost!,
              igvRate,
              isTaxable,
              base: purchase.base,
              igv: purchase.igv,
              total: purchase.total,
              paymentMethod: 'TRANSFERENCIA',
              status: 'REGISTRADO',
            },
          });

          await tx.move.update({
            where: { id: move.id },
            data: { expense: { connect: { id: expense.id } } },
          });
        }

        if (isAsset) {
          await tx.material.update({
            where: { id: data.materialId },
            data: {
              assetStatus: AssetStatus.IN_WAREHOUSE,
              assetResponsible: null,
            },
          });
        }

        return move;
      }

      const valuation = await calcularValorInventario(tx, data.obraId, data.materialId);
      const fallbackCost = valuation.avg || (await lastPurchaseCost(tx, data.obraId, data.materialId));
      const unitCost = round2(fallbackCost || 0);
      const totalCost = round2(unitCost * data.quantity);
      const moveAssetStatus = isAsset ? AssetStatus.OUT_ON_FIELD : null;
      const moveResponsible = isAsset ? (responsibleName ?? materialRow?.assetResponsible ?? null) : responsibleName;

      const move = await tx.move.create({
        data: {
          obraId: data.obraId,
          frenteId,
          materialId: data.materialId,
          proveedorId: null,
          type: PrismaMoveType.OUT,
          quantity: data.quantity,
          unitCost: unitCost || null,
          totalCost: totalCost || null,
          date: fecha,
          note: data.note ?? null,
          docType: PrismaDocType.OTRO,
          igvRate: 0,
          isTaxable: false,
          responsible: moveResponsible,
          assetStatus: moveAssetStatus,
        },
      });

      if (totalCost > 0) {
        const category = await ensureCategory(tx, ExpenseKind.MATERIAL_CONSUMO, CATEGORY_CONSUMO);
        await tx.expense.create({
          data: {
            obraId: data.obraId,
            frenteId,
            materialId: data.materialId,
            categoryId: category.id,
            moveId: move.id,
            docType: PrismaDocType.OTRO,
            date: fecha,
            description:
              data.note ??
              `Consumo de material (movimiento #${move.id})`,
            type: 'DIRECTO',
            variableType: 'VARIABLE',
            quantity: data.quantity,
            unitCost: unitCost || null,
            igvRate: 0,
            isTaxable: false,
            base: totalCost,
            igv: 0,
            total: totalCost,
            paymentMethod: 'OTRO',
            status: 'REGISTRADO',
          },
        });
      }

      if (isAsset) {
        await tx.material.update({
          where: { id: data.materialId },
          data: {
            assetStatus: AssetStatus.OUT_ON_FIELD,
            assetResponsible: moveResponsible,
          },
        });
      }

      return move;
    });

    const balanceAfter = await stockPorMaterial(data.obraId, data.materialId);
    res.json({ ...result, balanceAfter });
  } catch (error: any) {
    console.error('Error creando movimiento', error);
    res.status(500).json({ error: 'Error al registrar movimiento', detail: error.message });
  }
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
    mat = await prisma.material.update({
      where: { id: mat.id },
      data: { unit: parsed.data.unit },
    });
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

router.delete('/moves/:id', requireAdminDeleteKey, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

  try {
    await prisma.$transaction(async tx => {
      const move = await tx.move.findUnique({
        where: { id },
        include: { expense: true, material: true },
      });
      if (!move) {
        throw new Error('NOT_FOUND');
      }

      if (move.expense) {
        await tx.expense.delete({ where: { id: move.expense.id } });
      }

      await tx.move.delete({ where: { id } });

      if (move.material?.isCompanyAsset) {
        const last = await tx.move.findFirst({
          where: { materialId: move.materialId },
          orderBy: { date: 'desc' },
        });
        let status: AssetStatus = AssetStatus.IN_WAREHOUSE;
        let responsible: string | null = null;
        if (last?.assetStatus === AssetStatus.OUT_ON_FIELD) {
          status = AssetStatus.OUT_ON_FIELD;
          responsible = last.responsible ?? null;
        }
        await tx.material.update({
          where: { id: move.materialId },
          data: {
            assetStatus: status,
            assetResponsible: responsible,
          },
        });
      }
    });

    res.json({ ok: true });
  } catch (error: any) {
    if (error?.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }
    console.error('Error eliminando movimiento', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// actualizar movimiento
router.put('/moves/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const body = MoveUpdate.parse(req.body);

    const current = await prisma.move.findUnique({
      where: { id },
      include: { expense: true },
    });
    if (!current) return res.status(404).json({ error: 'Movimiento no encontrado' });

    const nextMaterialId = body.materialId ?? current.materialId;
    const nextQuantity = body.quantity ?? current.quantity;

    if (nextQuantity <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }

    if (current.type === 'OUT') {
      await validarStockEnEdicionOUT({
        obraId: current.obraId,
        oldMaterialId: current.materialId,
        newMaterialId: nextMaterialId,
        oldQty: current.quantity,
        newQty: nextQuantity,
      });
    } else {
      if (body.unitCost !== undefined && body.unitCost !== null && body.unitCost <= 0) {
        return res.status(400).json({ error: 'unitCost debe ser mayor a 0' });
      }
    }

    if (current.type === 'OUT' && body.proveedorId !== undefined) {
      body.proveedorId = null;
    }

    if (current.type === 'OUT' && (body.docType || body.docSerie || body.docNumero)) {
      return res.status(400).json({ error: 'Las salidas no pueden asociarse a comprobantes' });
    }

    if (current.type === 'IN' && body.proveedorId === undefined) {
      body.proveedorId = current.proveedorId;
    }

    const updated = await prisma.move.update({
      where: { id },
      data: {
        materialId: nextMaterialId,
        quantity: nextQuantity,
        unitCost:
          current.type === 'IN'
            ? body.unitCost ?? current.unitCost ?? null
            : current.unitCost ?? null,
        note: body.note !== undefined ? body.note : current.note,
        proveedorId:
          current.type === 'IN'
            ? body.proveedorId ?? current.proveedorId ?? null
            : null,
        docSerie:
          current.type === 'IN'
            ? body.docSerie?.trim().toUpperCase() ?? current.docSerie ?? null
            : current.docSerie ?? null,
        docNumero:
          current.type === 'IN'
            ? body.docNumero?.trim() ?? current.docNumero ?? null
            : current.docNumero ?? null,
        docType:
          current.type === 'IN'
            ? (body.docType as PrismaDocType | null | undefined) ?? current.docType ?? PrismaDocType.FACTURA
            : current.docType ?? PrismaDocType.OTRO,
        isTaxable:
          current.type === 'IN'
            ? body.isTaxable ?? current.isTaxable ?? true
            : current.isTaxable ?? false,
        igvRate:
          current.type === 'IN'
            ? body.igvRate ?? current.igvRate ?? DEFAULT_IGV
            : current.igvRate ?? 0,
        responsible:
          body.responsible !== undefined
            ? body.responsible
              ? body.responsible.trim()
              : null
            : current.responsible,
      },
    });

    await syncExpenseForMove(updated.id);
    res.json(updated);
  } catch (e: any) {
    console.error('PUT /moves/:id error', e);
    res.status(400).json({ error: e.message });
  }
});

// actualizar material
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

// reset total (borra movimientos) con clave
router.delete('/admin/reset', requireAdminDeleteKey, async (req, res) => {
  const key = req.header('X-Admin-Key');
  if (!key || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'No autorizado' });
  await prisma.move.deleteMany({});
  res.json({ ok: true });
});

// patch rápido (nota/cantidad) - mantiene compatibilidad
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

  try {
    const updated = await prisma.move.update({
      where: { id },
      data: parsed.data,
    });
    await syncExpenseForMove(updated.id);
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
