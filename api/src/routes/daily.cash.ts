import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { Prisma } from '@prisma/client';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';

const toPlainNumber = (value: Prisma.Decimal | number | null | undefined): number =>
  value ? Number(value) : 0;

const router = Router();

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const ExpenseItem = z
  .object({
    description: z.string().min(2).max(160),
    amount: z.number().min(0.01),
    personalAmount: z.number().min(0).optional(),
    paidWithPersonal: z.boolean().optional(),
  })
  .refine(
    data =>
      typeof data.personalAmount === 'number'
        ? data.personalAmount <= data.amount
        : true,
    {
      path: ['personalAmount'],
      message: 'El monto con dinero propio no puede exceder el gasto.',
    },
  );

const CreateRendition = z.object({
  date: z.string().optional(),
  obraId: z.number().int().positive().optional().nullable(),
  openingBalance: z.number().optional(),
  received: z.number().min(0),
  personalContribution: z.number().min(0).optional().nullable(),
  expenses: z.array(ExpenseItem).min(1),
  notes: z.string().max(500).optional().nullable(),
});

const parseLocalDate = (value?: string) => {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(value);
  }
  return new Date(year, month - 1, day);
};

const resolveOpeningBalance = async (date: Date, custom?: number | null) => {
  if (typeof custom === 'number' && Number.isFinite(custom)) {
    return custom;
  }
  const previous = await prisma.dailyCashRendition.findFirst({
    where: { date: { lt: date } },
    orderBy: { date: 'desc' },
  });
  return toPlainNumber(previous?.balance);
};

router.get('/admin/daily-cash', async (req, res) => {
  const obraId = req.query.obraId ? Number(req.query.obraId) : undefined;
  const from = parseDate(req.query.from as string | undefined);
  const to = parseDate(req.query.to as string | undefined);

  const where: Prisma.DailyCashRenditionWhereInput = {};
  if (obraId) where.obraId = obraId;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) {
      const limit = new Date(to);
      limit.setDate(limit.getDate() + 1);
      where.date.lt = limit;
    }
  }
  const limitRaw = req.query.limit ? Number(req.query.limit) : undefined;
  const take =
    limitRaw && Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(Math.trunc(limitRaw), 200))
      : undefined;

  const items = await prisma.dailyCashRendition.findMany({
    where,
    orderBy: { date: 'desc' },
    take,
    include: {
      expenses: {
        orderBy: { id: 'asc' },
      },
    },
  });
  const withExtras = items.map(item => {
    const personalSpent = item.expenses.reduce((acc, exp) => {
      const hasPersonalAmount = exp.personalAmount !== null && exp.personalAmount !== undefined;
      const personalAmount = hasPersonalAmount
        ? Number(exp.personalAmount)
        : exp.paidWithPersonal
          ? Number(exp.amount ?? 0)
          : 0;
      return acc + personalAmount;
    }, 0);
    const pending = personalSpent - Number(item.personalContribution ?? 0);
    return {
      ...item,
      pendingReimbursement: Number(pending.toFixed(2)),
    };
  });
  res.json({ items: withExtras });
});

router.post('/admin/daily-cash', async (req, res) => {
  const parsed = CreateRendition.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;
  const date = parseLocalDate(data.date);
  const expenses = data.expenses;
  const spent = expenses.reduce((acc, exp) => acc + exp.amount, 0);
  const personalContribution = data.personalContribution ?? 0;
  const openingBalance = await resolveOpeningBalance(date, data.openingBalance ?? null);
  const personalSpent = expenses.reduce((acc, exp) => {
    const personalAmount =
      typeof exp.personalAmount === 'number'
        ? exp.personalAmount
        : exp.paidWithPersonal
          ? exp.amount
          : 0;
    return acc + personalAmount;
  }, 0);
  const balance = Number((openingBalance + data.received + personalContribution - spent).toFixed(2));

  const created = await prisma.dailyCashRendition.create({
    data: {
      date,
      obraId: data.obraId ?? null,
      openingBalance,
      received: data.received,
      spent,
      personalContribution,
      balance,
      notes: data.notes ?? null,
      expenses: {
        create: expenses.map(exp => {
          const personalAmount =
            typeof exp.personalAmount === 'number'
              ? Math.min(exp.personalAmount, exp.amount)
              : exp.paidWithPersonal
                ? exp.amount
                : 0;
          return {
            description: exp.description.trim(),
            amount: exp.amount,
            personalAmount,
            paidWithPersonal: personalAmount > 0 || Boolean(exp.paidWithPersonal),
          };
        }),
      },
    },
    include: { expenses: true },
  });

  res.status(201).json({
    ...created,
    pendingReimbursement: Number((personalSpent - personalContribution).toFixed(2)),
  });
});

router.delete('/admin/daily-cash/:id', requireAdminDeleteKey, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  await prisma.dailyCashRendition.delete({ where: { id } });
  res.status(204).send();
});

export default router;
