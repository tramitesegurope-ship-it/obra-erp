import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { PayrollAdjustmentType, PayrollPeriodStatus, Prisma } from '@prisma/client';
import { closePayrollPeriod, generatePayrollPeriod, recalculatePayrollEntry } from '../services/payroll';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';

const router = Router();

const CreatePeriod = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  obraId: z.number().int().positive().optional().nullable(),
  workingDays: z.number().int().min(1).max(31).optional(),
  notes: z.string().max(400).optional().nullable(),
});

const UpdatePeriod = CreatePeriod.partial().extend({
  status: z.enum(['OPEN', 'PROCESSED', 'CLOSED']).optional(),
});

const AdjustmentCreate = z.object({
  type: z.enum(['BONUS', 'DEDUCTION', 'ADVANCE']),
  concept: z.string().min(2).max(120),
  amount: z.number().positive(),
});

const DEFAULT_PERIOD_DAYS = 30;

const clampToMonthDays = (year: number, month: number, value: number) => {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const normalized = Number.isFinite(value) ? Math.round(value) : DEFAULT_PERIOD_DAYS;
  return Math.max(1, Math.min(normalized, daysInMonth));
};

const buildPeriodRange = (year: number, month: number, workingDays: number) => {
  const days = clampToMonthDays(year, month, workingDays);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month - 1, days, 23, 59, 59));
  return { start, end, days };
};

router.post('/personnel/periods', async (req, res, next) => {
  try {
    const parsed = CreatePeriod.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }
    const requestedDays = parsed.data.workingDays ?? DEFAULT_PERIOD_DAYS;
    const { start, end, days } = buildPeriodRange(parsed.data.year, parsed.data.month, requestedDays);

    const created = await prisma.payrollPeriod.create({
      data: {
        month: parsed.data.month,
        year: parsed.data.year,
        startDate: start,
        endDate: end,
        workingDays: days,
        status: PayrollPeriodStatus.OPEN,
        notes: parsed.data.notes ?? null,
        obra: parsed.data.obraId ? { connect: { id: parsed.data.obraId } } : undefined,
      },
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado', detail: 'Ya existe un periodo para ese mes/obra' });
    }
    next(error);
  }
});

router.get('/personnel/periods', async (req, res, next) => {
  try {
    const obraId = req.query.obraId ? Number(req.query.obraId) : undefined;
    const status = req.query.status ? String(req.query.status) as PayrollPeriodStatus : undefined;

    const where: Prisma.PayrollPeriodWhereInput = {};
    if (obraId) where.obraId = obraId;
    if (status && ['OPEN', 'PROCESSED', 'CLOSED'].includes(status)) where.status = status as PayrollPeriodStatus;

    const items = await prisma.payrollPeriod.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/personnel/periods/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const period = await prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        entries: {
          include: {
            employee: true,
            adjustments: true,
          },
          orderBy: [
            { employee: { lastName: 'asc' } },
            { employee: { firstName: 'asc' } },
          ],
        },
      },
    });
    if (!period) return res.status(404).json({ error: 'Periodo no encontrado' });

    res.json(period);
  } catch (error) {
    next(error);
  }
});

router.patch('/personnel/periods/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = UpdatePeriod.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const existing = await prisma.payrollPeriod.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Periodo no encontrado' });
    }
    const data: Prisma.PayrollPeriodUpdateInput = {};
    const month = parsed.data.month ?? existing.month;
    const year = parsed.data.year ?? existing.year;
    const requestedDays = parsed.data.workingDays ?? existing.workingDays;
    const { start, end, days } = buildPeriodRange(year, month, requestedDays);
    data.month = month;
    data.year = year;
    data.startDate = start;
    data.endDate = end;
    data.workingDays = days;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes ?? null;
    if (parsed.data.obraId !== undefined) {
      data.obra = parsed.data.obraId ? { connect: { id: parsed.data.obraId } } : { disconnect: true };
    }
    if (parsed.data.status !== undefined) data.status = parsed.data.status;

    const updated = await prisma.payrollPeriod.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado', detail: 'Ya existe un periodo para ese mes/obra' });
    }
    next(error);
  }
});

router.post('/personnel/periods/:id/generate', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const recalcClosed = req.body?.recalcClosed === true;
    const result = await generatePayrollPeriod(id, { recalcClosed });

    res.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});

router.post('/personnel/periods/:id/close', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const closed = await closePayrollPeriod(id);
    res.json(closed);
  } catch (error) {
    next(error);
  }
});

router.get('/personnel/entries/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const entry = await prisma.payrollEntry.findUnique({
      where: { id },
      include: {
        employee: true,
        period: true,
        adjustments: true,
      },
    });
    if (!entry) return res.status(404).json({ error: 'Boleta no encontrada' });

    res.json(entry);
  } catch (error) {
    next(error);
  }
});

router.post('/personnel/entries/:id/adjustments', async (req, res, next) => {
  try {
    const entryId = Number(req.params.id);
    if (!entryId) return res.status(400).json({ error: 'ID inválido' });

    const parsed = AdjustmentCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const entry = await prisma.payrollEntry.findUnique({ where: { id: entryId } });
    if (!entry) return res.status(404).json({ error: 'Boleta no encontrada' });

    await prisma.payrollAdjustment.create({
      data: {
        entryId,
        type: parsed.data.type,
        concept: parsed.data.concept.trim(),
        amount: parsed.data.amount,
      },
    });

    const updated = await recalculatePayrollEntry(entryId);
    const withRelations = await prisma.payrollEntry.findUnique({
      where: { id: entryId },
      include: { employee: true, period: true, adjustments: true },
    });

    res.status(201).json(withRelations ?? updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/personnel/adjustments/:id', requireAdminDeleteKey, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const adjustment = await prisma.payrollAdjustment.findUnique({ where: { id } });
    if (!adjustment) return res.status(404).json({ error: 'Ajuste no encontrado' });

    await prisma.payrollAdjustment.delete({ where: { id } });
    const updated = await recalculatePayrollEntry(adjustment.entryId);
    const withRelations = await prisma.payrollEntry.findUnique({
      where: { id: adjustment.entryId },
      include: { employee: true, period: true, adjustments: true },
    });

    res.json(withRelations ?? updated);
  } catch (error) {
    next(error);
  }
});

export default router;
