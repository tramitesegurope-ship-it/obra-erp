import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma, DocType } from '@prisma/client';
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

const findDuplicateIncome = async (params: {
  docType: DocType;
  docSerie: string | null;
  docNumero: string | null;
  excludeId?: number;
}) => {
  if (!params.docNumero) return null;
  const where: Prisma.IncomeWhereInput = {
    docType: params.docType,
    docSerie: params.docSerie,
    docNumero: params.docNumero,
  };
  if (params.excludeId) {
    where.NOT = { id: params.excludeId };
  }
  return prisma.income.findFirst({ where, select: { id: true } });
};

// Schemas
const CreateIncome = z.object({
  obraId: z.number().int().positive(),
  frenteId: z.number().int().positive().optional().nullable(),
  date: z.string().optional(), // ISO
  description: z.string().max(300).optional().nullable(),
  docType: z.enum(['FACTURA','BOLETA','RECIBO','OTRO']).optional(),
  docSerie: z.string().max(12).optional().nullable(),
  docNumero: z.string().max(20).optional().nullable(),
  igvRate: z.number().min(0).max(1).optional(),     // 0.18 por defecto
  isTaxable: z.boolean().optional(),                // true por defecto
  base: z.number().positive(),                      // monto sin IGV
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

router.get('/admin/incomes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const obraId = req.query.obraId ? Number(req.query.obraId) : undefined;
    const from = req.query.from ? parseLocalDate(String(req.query.from)) : undefined;
    const to   = req.query.to   ? parseLocalDate(String(req.query.to))   : undefined;

    const where: Prisma.IncomeWhereInput = {};
    if (obraId) where.obraId = obraId;
    if (from || to) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (from) dateFilter.gte = from;
      if (to) dateFilter.lt = addDays(to, 1);
      where.date = dateFilter;
    }

    const items = await prisma.income.findMany({ where, orderBy: { date: 'desc' }});
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/incomes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateIncome.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const data = parsed.data;
    const docType = normalizeDocType(data.docType ?? null);
    const docSerie = normalizeSerie(data.docSerie ?? null);
    const docNumero = normalizeNumero(data.docNumero ?? null);
    const igvRate = data.igvRate ?? 0.18;
    const isTaxable = data.isTaxable ?? true;

    const duplicate = await findDuplicateIncome({ docType, docSerie, docNumero });
    if (duplicate) {
      const formatted = `${docSerie ? `${docSerie}-` : ''}${docNumero}`;
      return res.status(409).json({
        error: 'Documento duplicado',
        detail: `Ya registraste el comprobante ${formatted} (ingreso #${duplicate.id}).`,
      });
    }

    const base = data.base;
    const igv  = isTaxable ? Number((base * igvRate).toFixed(2)) : 0;
    const total = Number((base + igv).toFixed(2));

    const created = await prisma.income.create({
      data: {
        obraId: data.obraId,
        frenteId: data.frenteId ?? null,
        description: data.description ?? null,
        docType,
        docSerie,
        docNumero,
        igvRate,
        isTaxable,
        base,
        igv,
        total,
        date: parseLocalDate(data.date) ?? new Date(),
      }
    });

    res.status(201).json(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(400).json({
        error: 'Relación inválida',
        detail: 'obraId y frenteId deben existir antes de crear el ingreso.',
      });
    }
    next(error);
  }
});

router.put('/admin/incomes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const parsed = CreateIncome.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const data = parsed.data;
    const docType = normalizeDocType(data.docType ?? null);
    const docSerie = normalizeSerie(data.docSerie ?? null);
    const docNumero = normalizeNumero(data.docNumero ?? null);
    const igvRate = data.igvRate ?? 0.18;
    const isTaxable = data.isTaxable ?? true;

    const duplicate = await findDuplicateIncome({ docType, docSerie, docNumero, excludeId: id });
    if (duplicate) {
      const formatted = `${docSerie ? `${docSerie}-` : ''}${docNumero}`;
      return res.status(409).json({
        error: 'Documento duplicado',
        detail: `Ya registraste el comprobante ${formatted} (ingreso #${duplicate.id}).`,
      });
    }

    const base = data.base;
    const igv = isTaxable ? Number((base * igvRate).toFixed(2)) : 0;
    const total = Number((base + igv).toFixed(2));

    const updated = await prisma.income.update({
      where: { id },
      data: {
        obraId: data.obraId,
        frenteId: data.frenteId ?? null,
        description: data.description ?? null,
        docType,
        docSerie,
        docNumero,
        igvRate,
        isTaxable,
        base,
        igv,
        total,
        date: parseLocalDate(data.date) ?? new Date(),
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Ingreso no encontrado' });
      }
      if (error.code === 'P2003') {
        return res.status(400).json({
          error: 'Relación inválida',
          detail: 'obraId y frenteId deben existir antes de actualizar el ingreso.',
        });
      }
    }
    next(error);
  }
});

router.delete('/admin/incomes/:id', requireAdminDeleteKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    await prisma.income.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return res.status(404).json({ error: 'Ingreso no encontrado' });
    }
    next(error);
  }
});

export default router;
