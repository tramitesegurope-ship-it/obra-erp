import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { PartnerLoanStatus } from '@prisma/client';

const router = Router();

const PartnerBody = z.object({
  name: z.string().trim().min(2).max(120),
});

router.get('/partners/internal', async (_req, res) => {
  const items = await prisma.partner.findMany({
    orderBy: { name: 'asc' },
  });
  res.json({ items });
});

router.post('/partners/internal', async (req, res) => {
  try {
    const { name } = PartnerBody.parse(req.body);
    const created = await prisma.partner.create({
      data: { name: name.trim() },
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado', detail: 'Ya existe un socio con ese nombre' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validación', issues: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.patch('/partners/internal/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
    const { name } = PartnerBody.parse(req.body);
    const updated = await prisma.partner.update({
      where: { id },
      data: { name: name.trim() },
    });
    res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado', detail: 'Ya existe un socio con ese nombre' });
    }
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Validación', issues: error.issues });
    }
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'No encontrado' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

const LoansQuery = z.object({
  status: z.nativeEnum(PartnerLoanStatus).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

router.get('/partners/internal/loans', async (req, res) => {
  const parsed = LoansQuery.safeParse({
    status: req.query.status,
    from: req.query.from,
    to: req.query.to,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }

  const where: any = {};
  if (parsed.data.status) where.status = parsed.data.status;
  if (parsed.data.from || parsed.data.to) {
    where.date = {};
    if (parsed.data.from) where.date.gte = new Date(parsed.data.from);
    if (parsed.data.to) where.date.lte = new Date(parsed.data.to);
  }

  const loans = await prisma.partnerLoan.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      giver: true,
      receiver: true,
    },
  });

  const pending = await prisma.partnerLoan.findMany({
    where: { status: PartnerLoanStatus.PENDING },
    include: { receiver: true },
  });

  const pendingAccumulator = pending.reduce((acc, loan) => {
    const current = acc.get(loan.receiverId) ?? {
      partner: loan.receiver,
      amount: 0,
    };
    current.amount += Number(loan.amount);
    acc.set(loan.receiverId, current);
    return acc;
  }, new Map<number, { partner: { name: string }; amount: number }>());

  const pendingByReceiver = Array.from(pendingAccumulator.entries()).map(
    ([partnerId, payload]) => ({
      partnerId,
      partnerName: payload.partner.name,
      pendingAmount: Math.round(payload.amount * 100) / 100,
    }),
  );

  res.json({
    items: loans.map(loan => ({
      id: loan.id,
      date: loan.date.toISOString(),
      giver: { id: loan.giver.id, name: loan.giver.name },
      receiver: { id: loan.receiver.id, name: loan.receiver.name },
      amount: Number(loan.amount),
      note: loan.note,
      status: loan.status,
      financeRefs: Array.isArray(loan.financeRefs) ? loan.financeRefs : [],
      closeDate: loan.closeDate ? loan.closeDate.toISOString() : null,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
    })),
    summary: {
      pendingByReceiver,
    },
  });
});

const LoansBody = z.object({
  date: z.string().datetime().optional(),
  giverId: z.number().int().positive(),
  receiverId: z.number().int().positive(),
  amount: z.number().positive(),
  note: z.string().max(400).optional().nullable(),
});

router.post('/partners/internal/loans', async (req, res) => {
  const parsed = LoansBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }
  if (parsed.data.giverId === parsed.data.receiverId) {
    return res.status(400).json({ error: 'El socio que entrega y el que recibe deben ser distintos.' });
  }

  try {
    const created = await prisma.partnerLoan.create({
      data: {
        date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
        giverId: parsed.data.giverId,
        receiverId: parsed.data.receiverId,
        amount: parsed.data.amount,
        note: parsed.data.note?.trim() || null,
      },
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2003') {
      return res.status(400).json({ error: 'Socio no encontrado' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

const LoanUpdate = z.object({
  status: z.nativeEnum(PartnerLoanStatus).optional(),
  note: z.string().max(400).optional().nullable(),
  financeRefs: z.array(z.string().trim().min(1)).max(10).optional(),
});

router.patch('/partners/internal/loans/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
  const parsed = LoanUpdate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }

  try {
    const data: any = {};
    if (parsed.data.status) {
      data.status = parsed.data.status;
      if (parsed.data.status === PartnerLoanStatus.PENDING) {
        data.closeDate = null;
      } else {
        data.closeDate = new Date();
      }
    }
    if (parsed.data.note !== undefined) {
      data.note = parsed.data.note?.trim() || null;
    }
    if (parsed.data.financeRefs !== undefined) {
      data.financeRefs = parsed.data.financeRefs;
    }

    const updated = await prisma.partnerLoan.update({
      where: { id },
      data,
      include: {
        giver: true,
        receiver: true,
      },
    });

    res.json({
      id: updated.id,
      date: updated.date.toISOString(),
      giver: { id: updated.giver.id, name: updated.giver.name },
      receiver: { id: updated.receiver.id, name: updated.receiver.name },
      amount: Number(updated.amount),
      note: updated.note,
      status: updated.status,
      financeRefs: Array.isArray(updated.financeRefs) ? updated.financeRefs : [],
      closeDate: updated.closeDate ? updated.closeDate.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;
