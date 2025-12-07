import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma, ExpenseKind, DocType } from '@prisma/client';
import prisma from '../db';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';

const router = Router();

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const normalizeSerie = (input?: string | null): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed.toUpperCase();
};

const normalizeNumero = (input?: string | null): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const normalizeDocType = (input?: DocType | null): DocType => input ?? 'FACTURA';

const findDuplicateExpense = async (params: {
  docType: DocType;
  docSerie: string | null;
  docNumero: string | null;
  excludeId?: number;
}) => {
  if (!params.docNumero) return null;
  const where: Prisma.ExpenseWhereInput = {
    docType: params.docType,
    docSerie: params.docSerie,
    docNumero: params.docNumero,
  };
  if (params.excludeId) {
    where.NOT = { id: params.excludeId };
  }
  return prisma.expense.findFirst({ where, select: { id: true } });
};

// Crear categoría rápida (para seed o UI)
router.post('/admin/expense-categories', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(60),
    kind: z.nativeEnum(ExpenseKind).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const name = parsed.data.name.trim();
  const kind = parsed.data.kind ?? ExpenseKind.OPERATIVO;

  const cat = await prisma.expenseCategory.upsert({
    where: { name },
    update: { kind },
    create: { name, kind },
  });
  res.status(201).json(cat);
});

// Listar categorías para el front-end
router.get('/admin/expense-categories', async (_req, res, next) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ items: categories });
  } catch (error) {
    next(error);
  }
});

const parseLocalDate = (value?: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return new Date(value);
  }
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
};

const CreateExpense = z.object({
  obraId: z.number().int().positive(),
  frenteId: z.number().int().positive().optional().nullable(),
  proveedorId: z.number().int().positive().optional().nullable(),
  materialId: z.number().int().positive().optional().nullable(),
  categoryId: z.number().int().positive().optional().nullable(),
  docType: z.enum(['FACTURA','BOLETA','RECIBO','OTRO']).optional(),
  docSerie: z.string().max(12).optional().nullable(),
  docNumero: z.string().max(20).optional().nullable(),
  date: z.string().optional(), // ISO
  description: z.string().max(300).optional().nullable(),
  spentBy: z.string().max(120).optional().nullable(),

  type: z.enum(['DIRECTO','INDIRECTO']).optional(),
  variableType: z.enum(['FIJO','VARIABLE']).optional(),

  quantity: z.number().positive().optional(),
  unitCost: z.number().positive().optional(),

  igvRate: z.number().min(0).max(1).optional(),
  isTaxable: z.boolean().optional(),
  base: z.number().positive(), // si usas quantity*unitCost, puedes enviarlo ya calculado
  paymentMethod: z.enum(['EFECTIVO','TRANSFERENCIA','TARJETA','YAPE','PLIN','OTRO']).optional(),
  paidAt: z.string().optional().nullable(), // ISO
  status: z.string().optional(), // PENDIENTE/PAGADO/ANULADO
  reminderIntervalDays: z.number().int().min(1).max(365).optional(),
});

router.get('/admin/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const obraId = req.query.obraId ? Number(req.query.obraId) : undefined;
    const from = req.query.from ? parseLocalDate(String(req.query.from)) : undefined;
    const to   = req.query.to   ? parseLocalDate(String(req.query.to))   : undefined;
    const proveedorId = req.query.proveedorId ? Number(req.query.proveedorId) : undefined;
    const docTypeRaw = req.query.docType ? String(req.query.docType).toUpperCase() : undefined;
    const docTypeFilter = docTypeRaw && ['FACTURA','BOLETA','RECIBO','OTRO'].includes(docTypeRaw)
      ? (docTypeRaw as DocType)
      : undefined;
    const spentByRaw = req.query.spentBy ? String(req.query.spentBy).trim() : undefined;
    const limitRaw = req.query.limit ? Number(req.query.limit) : undefined;
    const take =
      limitRaw && Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(Math.trunc(limitRaw), 200))
        : undefined;

    const where: Prisma.ExpenseWhereInput = {};
    if (obraId) where.obraId = obraId;
    if (proveedorId) where.proveedorId = proveedorId;
    if (from || to) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (from) dateFilter.gte = from;
      if (to) dateFilter.lt = addDays(to, 1);
      where.date = dateFilter;
    }
    if (docTypeFilter) where.docType = docTypeFilter;
    if (spentByRaw) {
      where.spentBy = spentByRaw;
    }

    const items = await prisma.expense.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take,
      include: {
        proveedor: true,
        category: true,
        material: true,
      }
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateExpense.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const d = parsed.data;
    const docType = normalizeDocType(d.docType ?? null);
    const docSerie = normalizeSerie(d.docSerie ?? null);
    const docNumero = normalizeNumero(d.docNumero ?? null);
    const igvRate = d.igvRate ?? 0.18;
    const isTaxable = d.isTaxable ?? true;

    const duplicate = await findDuplicateExpense({ docType, docSerie, docNumero });
    if (duplicate) {
      const formatted = `${docSerie ? `${docSerie}-` : ''}${docNumero}`;
      return res.status(409).json({
        error: 'Documento duplicado',
        detail: `Ya registraste el comprobante ${formatted} (egreso #${duplicate.id}).`,
      });
    }

    const spentBy = d.spentBy && d.spentBy.trim() ? d.spentBy.trim() : null;
    const base = d.base; // si quieres, podrías recalcular base a partir de quantity*unitCost
    const igv  = isTaxable ? Number((base * igvRate).toFixed(2)) : 0;
    const total = Number((base + igv).toFixed(2));
    const expenseDate = parseLocalDate(d.date) ?? new Date();
    const reminderInterval = d.reminderIntervalDays ?? null;
    const reminderNextDate =
      reminderInterval && reminderInterval > 0 ? addDays(expenseDate, reminderInterval) : null;

    const created = await prisma.expense.create({
      data: {
        obraId: d.obraId,
        frenteId: d.frenteId ?? null,
        proveedorId: d.proveedorId ?? null,
        materialId: d.materialId ?? null,
        categoryId: d.categoryId ?? null,
        docType,
        docSerie,
        docNumero,
        date: expenseDate,
        description: d.description ?? null,
        spentBy,

        type: d.type ?? 'DIRECTO',
        variableType: d.variableType ?? 'FIJO',

        quantity: d.quantity ?? null,
        unitCost: d.unitCost ?? null,

        igvRate, isTaxable, base, igv, total,

        paymentMethod: d.paymentMethod ?? 'TRANSFERENCIA',
        paidAt: d.paidAt ? new Date(d.paidAt) : null,
        status: d.status ?? 'REGISTRADO',
        reminderIntervalDays: reminderInterval,
        reminderNextDate,
      }
    });

    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({
        error: 'Relación inválida',
        detail: 'obraId, categoryId, proveedorId, materialId y frenteId deben existir antes de crear el gasto.',
      });
    }
    next(error);
  }
});

router.put('/admin/expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const parsed = CreateExpense.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const d = parsed.data;
    const docType = normalizeDocType(d.docType ?? null);
    const docSerie = normalizeSerie(d.docSerie ?? null);
    const docNumero = normalizeNumero(d.docNumero ?? null);
    const igvRate = d.igvRate ?? 0.18;
    const isTaxable = d.isTaxable ?? true;

    const duplicate = await findDuplicateExpense({ docType, docSerie, docNumero, excludeId: id });
    if (duplicate) {
      const formatted = `${docSerie ? `${docSerie}-` : ''}${docNumero}`;
      return res.status(409).json({
        error: 'Documento duplicado',
        detail: `Ya registraste el comprobante ${formatted} (egreso #${duplicate.id}).`,
      });
    }

    const spentBy = d.spentBy && d.spentBy.trim() ? d.spentBy.trim() : null;
    const base = d.base;
    const igv = isTaxable ? Number((base * igvRate).toFixed(2)) : 0;
    const total = Number((base + igv).toFixed(2));
    const expenseDate = parseLocalDate(d.date) ?? new Date();
    const reminderInterval = d.reminderIntervalDays ?? null;
    const reminderNextDate =
      reminderInterval && reminderInterval > 0 ? addDays(expenseDate, reminderInterval) : null;

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        obraId: d.obraId,
        frenteId: d.frenteId ?? null,
        proveedorId: d.proveedorId ?? null,
        materialId: d.materialId ?? null,
        categoryId: d.categoryId ?? null,
        docType,
        docSerie,
        docNumero,
        date: expenseDate,
        description: d.description ?? null,
        spentBy,

        type: d.type ?? 'DIRECTO',
        variableType: d.variableType ?? 'FIJO',

        quantity: d.quantity ?? null,
        unitCost: d.unitCost ?? null,

        igvRate,
        isTaxable,
        base,
        igv,
        total,

        paymentMethod: d.paymentMethod ?? 'TRANSFERENCIA',
        paidAt: d.paidAt ? new Date(d.paidAt) : null,
        status: d.status ?? 'REGISTRADO',
        reminderIntervalDays: reminderInterval,
        reminderNextDate,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Egreso no encontrado' });
      }
      if (error.code === 'P2003') {
        return res.status(400).json({
          error: 'Relación inválida',
          detail:
            'obraId, categoryId, proveedorId, materialId y frenteId deben existir antes de actualizar el gasto.',
        });
      }
    }
    next(error);
  }
});

router.delete('/admin/expenses/:id', requireAdminDeleteKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    await prisma.expense.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return res.status(404).json({ error: 'Egreso no encontrado' });
    }
    next(error);
  }
});

export default router;
