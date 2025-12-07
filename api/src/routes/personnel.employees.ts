import { Router, type Request } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { Prisma, BankType } from '@prisma/client';
import { requireAdminDeleteKey } from '../middleware/adminDeleteKey';
import { verifyDeletePassword } from '../services/adminSecurity';

const ADMIN_PASSWORD_HEADER = 'x-admin-delete-password';

const extractAdminPassword = (req: Request, inline?: string | null) => {
  if (inline && inline.trim()) return inline.trim();
  const fromHeader = req.header(ADMIN_PASSWORD_HEADER);
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  if (typeof req.body?.adminPassword === 'string' && req.body.adminPassword.trim()) {
    return req.body.adminPassword.trim();
  }
  if (typeof req.query?.adminPassword === 'string' && (req.query.adminPassword as string).trim()) {
    return (req.query.adminPassword as string).trim();
  }
  return null;
};

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMPLOYEE_AREA_VALUES = ['OPERATIVE', 'ADMINISTRATIVE'] as const;
type EmployeeAreaValue = (typeof EMPLOYEE_AREA_VALUES)[number];
const BANK_TYPES = ['BCP', 'INTERBANK', 'SCOTIABANK', 'BANCO_NACION', 'YAPE_PLIN', 'OTROS'] as const;

const parseDate = (value?: string | null) => {
  if (!value) return null;
  if (!DATE_RE.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const EmployeeCreate = z.object({
  code: z.string().max(25).optional().nullable(),
  firstName: z.string().min(1, 'Nombre requerido'),
  lastName: z.string().min(1, 'Apellido requerido'),
  documentType: z.enum(['DNI', 'CE', 'PASS', 'OTRO']).optional(),
  documentNumber: z.string().min(4).max(20).optional().nullable(),
  position: z.string().max(120).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  bankType: z.enum(BANK_TYPES).optional(),
  accountNumber: z.string().max(40).optional().nullable(),
  cci: z.string().max(40).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  baseSalary: z.number().nonnegative(),
  dailyHours: z.number().positive().max(24).optional(),
  pensionSystem: z.enum(['NINGUNO', 'ONP', 'AFP', 'SNP', 'EXONERADO']).optional(),
  pensionRate: z.number().min(0).max(1).optional(),
  healthRate: z.number().min(0).max(1).optional(),
  obraId: z.number().int().positive().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  absenceSundayPenalty: z.boolean().optional(),
  area: z.enum(EMPLOYEE_AREA_VALUES).optional(),
});

const EmployeeUpdate = EmployeeCreate.partial().extend({
  isActive: z.boolean().optional(),
});

const AccumulationPaymentBody = z.object({
  paid: z.boolean(),
  adminPassword: z.string().optional(),
});

const toEmployeeData = (input: z.infer<typeof EmployeeCreate>) => {
  const data: Prisma.EmployeeCreateInput = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    baseSalary: input.baseSalary,
  };
  data.code = input.code?.trim() ?? null;
  if (input.documentType) data.documentType = input.documentType;
  data.documentNumber = input.documentNumber?.trim() ?? null;
  data.position = input.position?.trim() ?? null;
  data.phone = input.phone?.trim() ?? null;
  data.email = input.email?.trim() ?? null;
  data.bankType = (input.bankType ?? 'BCP') as BankType;
  data.accountNumber = input.accountNumber?.trim() ?? null;
  data.cci = input.cci?.trim() ?? null;
  data.startDate = parseDate(input.startDate) ?? undefined;
  data.endDate = parseDate(input.endDate) ?? undefined;
  if (typeof input.dailyHours === 'number') data.dailyHours = input.dailyHours;
  if (input.pensionSystem) data.pensionSystem = input.pensionSystem;
  if (typeof input.pensionRate === 'number') data.pensionRate = input.pensionRate;
  if (typeof input.healthRate === 'number') data.healthRate = input.healthRate;
  if (input.obraId) {
    data.obra = { connect: { id: input.obraId } };
  }
  data.notes = input.notes ?? null;
  if (typeof input.absenceSundayPenalty === 'boolean') {
    data.absenceSundayPenalty = input.absenceSundayPenalty;
  }
  data.area = input.area ?? 'OPERATIVE';
  return data;
};

router.get('/personnel/employees', async (req, res, next) => {
  try {
    const obraId = req.query.obraId ? Number(req.query.obraId) : undefined;
    const isActive = req.query.active === undefined
      ? true
      : req.query.active === 'true' || req.query.active === '1';

    const where: Prisma.EmployeeWhereInput = {};
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (obraId) where.obraId = obraId;
    const area = typeof req.query.area === 'string' ? req.query.area.toUpperCase() : undefined;
    if (area && EMPLOYEE_AREA_VALUES.includes(area as EmployeeAreaValue)) {
      where.area = area as EmployeeAreaValue;
    }

    const items = await prisma.employee.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/personnel/employees/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const employee = await prisma.employee.findUnique({
      where: { id },
    });
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

    res.json(employee);
  } catch (error) {
    next(error);
  }
});

router.post('/personnel/employees', async (req, res, next) => {
  try {
    const parsed = EmployeeCreate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const created = await prisma.employee.create({
      data: toEmployeeData(parsed.data),
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado', detail: 'El código o documento ya existe' });
    }
    next(error);
  }
});

router.patch('/personnel/employees/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = EmployeeUpdate.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const exists = await prisma.employee.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ error: 'Empleado no encontrado' });

    const data: Prisma.EmployeeUpdateInput = {};

    if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName.trim();
    if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName.trim();
    if (parsed.data.baseSalary !== undefined) data.baseSalary = parsed.data.baseSalary;
    if (parsed.data.code !== undefined) data.code = parsed.data.code ? parsed.data.code.trim() : null;
    if (parsed.data.documentType !== undefined) data.documentType = parsed.data.documentType;
    if (parsed.data.documentNumber !== undefined) data.documentNumber = parsed.data.documentNumber?.trim() ?? null;
    if (parsed.data.position !== undefined) data.position = parsed.data.position?.trim() ?? null;
    if (parsed.data.phone !== undefined) data.phone = parsed.data.phone?.trim() ?? null;
    if (parsed.data.email !== undefined) data.email = parsed.data.email?.trim() ?? null;
    if (parsed.data.bankType !== undefined) data.bankType = parsed.data.bankType as BankType;
    if (parsed.data.accountNumber !== undefined) data.accountNumber = parsed.data.accountNumber?.trim() ?? null;
    if (parsed.data.cci !== undefined) data.cci = parsed.data.cci?.trim() ?? null;
    if (parsed.data.dailyHours !== undefined) data.dailyHours = parsed.data.dailyHours;
    if (parsed.data.pensionSystem !== undefined) data.pensionSystem = parsed.data.pensionSystem;
    if (parsed.data.pensionRate !== undefined) data.pensionRate = parsed.data.pensionRate;
    if (parsed.data.healthRate !== undefined) data.healthRate = parsed.data.healthRate;
    if (parsed.data.startDate !== undefined) data.startDate = parseDate(parsed.data.startDate);
    if (parsed.data.endDate !== undefined) data.endDate = parseDate(parsed.data.endDate);
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes ?? null;
    if (parsed.data.obraId !== undefined) {
      data.obra = parsed.data.obraId
        ? { connect: { id: parsed.data.obraId } }
        : { disconnect: true };
    }
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.absenceSundayPenalty !== undefined) {
      data.absenceSundayPenalty = parsed.data.absenceSundayPenalty;
    }
    if (parsed.data.area !== undefined) data.area = parsed.data.area;

    const updated = await prisma.employee.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicado', detail: 'El código o documento ya existe' });
    }
    next(error);
  }
});

router.delete('/personnel/employees/:id', requireAdminDeleteKey, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    await prisma.employee.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/personnel/accumulation-payments', async (_req, res, next) => {
  try {
    const rows = await prisma.employeeAccumulationPayment.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ items: rows.map(row => ({ employeeId: row.employeeId, paid: row.paid, paidAt: row.paidAt })) });
  } catch (error) {
    next(error);
  }
});

router.patch('/personnel/employees/:id/accumulation-payment', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = AccumulationPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

    const existing = await prisma.employeeAccumulationPayment.findUnique({ where: { employeeId: id } });
    if (existing && existing.paid === parsed.data.paid) {
      return res.json({ employeeId: existing.employeeId, paid: existing.paid, paidAt: existing.paidAt });
    }

    if (existing?.paid && !parsed.data.paid) {
      const password = extractAdminPassword(req, parsed.data.adminPassword ?? null);
      if (!password) {
        return res.status(403).json({ error: 'Desbloquea Seguridad para modificar un pago confirmado.' });
      }
      const ok = await verifyDeletePassword(password);
      if (!ok) {
        return res.status(403).json({ error: 'Contraseña de Seguridad incorrecta.' });
      }
    }

    const now = new Date();
    const record = await prisma.employeeAccumulationPayment.upsert({
      where: { employeeId: id },
      update: { paid: parsed.data.paid, paidAt: parsed.data.paid ? now : null },
      create: { employeeId: id, paid: parsed.data.paid, paidAt: parsed.data.paid ? now : null },
    });

    res.json({ employeeId: record.employeeId, paid: record.paid, paidAt: record.paidAt });
  } catch (error) {
    next(error);
  }
});

export default router;
