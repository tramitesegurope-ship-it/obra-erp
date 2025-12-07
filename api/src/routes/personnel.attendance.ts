import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseDate = (value: string) => {
  if (!DATE_RE.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Fecha inválida');
    }
    return parsed;
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const AttendanceUpsert = z.object({
  employeeId: z.number().int().positive(),
  date: z.string().regex(DATE_RE, 'Formato esperado YYYY-MM-DD'),
  status: z.enum(['PRESENT', 'TARDY', 'ABSENT', 'PERMISSION']).default('PRESENT'),
  minutesLate: z.number().int().min(0).optional(),
  permissionHours: z.number().min(0).max(24).optional(),
  extraHours: z.number().min(0).max(24).optional(),
  permissionPaid: z.boolean().optional(),
  holidayWorked: z.boolean().optional(),
  holidayCount: z.number().int().min(0).max(10).optional(),
  notes: z.string().max(400).optional().nullable(),
});

router.get('/personnel/attendance', async (req, res, next) => {
  try {
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
    const obraId = req.query.obraId ? Number(req.query.obraId) : undefined;
    const from = req.query.from ? parseDate(String(req.query.from)) : undefined;
    const to = req.query.to ? parseDate(String(req.query.to)) : undefined;

    const where: Prisma.AttendanceRecordWhereInput = {};
    if (employeeId) where.employeeId = employeeId;
    if (from || to) where.date = { gte: from, lte: to };
    if (obraId && !employeeId) {
      where.employee = {
        OR: [{ obraId }, { obraId: null }],
      };
    }

    const items = await prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }],
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            position: true,
            obraId: true,
          },
        },
      },
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/personnel/attendance', async (req, res, next) => {
  try {
    const parsed = AttendanceUpsert.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const dateValue = parseDate(parsed.data.date);
    const holidayCount =
      parsed.data.holidayCount ?? (parsed.data.holidayWorked ? 1 : 0);

    const data: Prisma.AttendanceRecordUncheckedCreateInput = {
      employeeId: parsed.data.employeeId,
      date: dateValue,
      status: parsed.data.status,
      minutesLate: parsed.data.minutesLate ?? 0,
      permissionHours: parsed.data.permissionHours ?? null,
      extraHours: parsed.data.extraHours ?? null,
      permissionPaid: parsed.data.permissionPaid ?? false,
      holidayWorked: holidayCount > 0,
      holidayCount,
      notes: parsed.data.notes ?? null,
    };

    const record = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: parsed.data.employeeId,
          date: dateValue,
        },
      },
      create: data,
      update: {
        status: data.status,
        minutesLate: data.minutesLate,
        permissionHours: data.permissionHours,
        extraHours: data.extraHours,
        permissionPaid: data.permissionPaid,
        holidayWorked: data.holidayWorked,
        holidayCount: data.holidayCount,
        notes: data.notes,
      },
    });

    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

router.patch('/personnel/attendance/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = AttendanceUpsert.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const exists = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ error: 'Registro no encontrado' });

    const data: Prisma.AttendanceRecordUpdateInput = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.minutesLate !== undefined) data.minutesLate = parsed.data.minutesLate;
    if (parsed.data.permissionHours !== undefined) data.permissionHours = parsed.data.permissionHours;
    if (parsed.data.extraHours !== undefined) data.extraHours = parsed.data.extraHours;
    if (parsed.data.permissionPaid !== undefined) data.permissionPaid = parsed.data.permissionPaid;
    if (parsed.data.holidayWorked !== undefined) data.holidayWorked = parsed.data.holidayWorked;
    if (parsed.data.holidayCount !== undefined) {
      data.holidayCount = parsed.data.holidayCount;
      if (parsed.data.holidayWorked === undefined) {
        data.holidayWorked = parsed.data.holidayCount > 0;
      }
    }
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes ?? null;
    if (parsed.data.date !== undefined) data.date = parseDate(parsed.data.date);
    if (parsed.data.employeeId !== undefined) {
      data.employee = { connect: { id: parsed.data.employeeId } };
    }

    const updated = await prisma.attendanceRecord.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/personnel/attendance/:id', requireAdminDeleteKey, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    await prisma.attendanceRecord.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/personnel/attendance/statistics/:obraId', async (req, res, next) => {
  try {
    const obraId = Number(req.params.obraId);
    if (!obraId) return res.status(400).json({ error: 'obraId inválido' });

    const from = req.query.from ? parseDate(String(req.query.from)) : undefined;
    const to = req.query.to ? parseDate(String(req.query.to)) : undefined;

    const where: Prisma.AttendanceRecordWhereInput = {
      employee: { obraId },
    };
    if (from || to) where.date = { gte: from, lte: to };

    const grouped = await prisma.attendanceRecord.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const stats = Object.values(AttendanceStatus).reduce<Record<string, number>>((acc, status) => {
      acc[status] = grouped.find(g => g.status === status)?._count.status ?? 0;
      return acc;
    }, {});

    res.json({ obraId, stats });
  } catch (error) {
    next(error);
  }
});

export default router;
