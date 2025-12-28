import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../db';

const router = Router();

const decimalToNumber = (value?: Prisma.Decimal | number | string | null) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return (value as Prisma.Decimal).toNumber();
  }
  return Number(value);
};

router.get('/search/global', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 15) : 5;
  const hasTerm = query.length > 0;

  const [orders, suppliers, quotations, employees, materials] = await Promise.all([
    prisma.purchaseOrderLog.findMany({
      where: hasTerm
        ? {
            OR: [
              { orderNumber: { contains: query } },
              { supplierName: { contains: query } },
            ],
          }
        : undefined,
      select: {
        id: true,
        processId: true,
        process: { select: { id: true, name: true, code: true } },
        supplierName: true,
        orderNumber: true,
        issueDate: true,
        currency: true,
        total: true,
      },
      orderBy: hasTerm ? { issueDate: 'desc' } : { createdAt: 'desc' },
      take: limit,
    }),
    prisma.proveedor.findMany({
      where: hasTerm
        ? {
            OR: [
              { name: { contains: query } },
              { ruc: { contains: query } },
              { phone: { contains: query } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        ruc: true,
        phone: true,
      },
      orderBy: hasTerm ? { name: 'asc' } : { id: 'desc' },
      take: limit,
    }),
    prisma.quotation.findMany({
      where: hasTerm
        ? {
            OR: [
              { supplierName: { contains: query } },
              { proveedor: { name: { contains: query } } },
              { process: { name: { contains: query } } },
            ],
          }
        : undefined,
      select: {
        id: true,
        processId: true,
        process: { select: { id: true, name: true, code: true } },
        proveedor: { select: { name: true } },
        supplierName: true,
        status: true,
        currency: true,
        totalAmountPen: true,
        totalAmount: true,
      },
      orderBy: hasTerm ? { updatedAt: 'desc' } : { createdAt: 'desc' },
      take: limit,
    }),
    prisma.employee.findMany({
      where: hasTerm
        ? {
            OR: [
              { firstName: { contains: query } },
              { lastName: { contains: query } },
              { documentNumber: { contains: query } },
              { phone: { contains: query } },
            ],
          }
        : undefined,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        area: true,
        phone: true,
        documentNumber: true,
        accountNumber: true,
        cci: true,
      },
      orderBy: hasTerm ? { updatedAt: 'desc' } : { lastName: 'asc' },
      take: limit,
    }),
    prisma.material.findMany({
      where: hasTerm
        ? {
            OR: [
              { name: { contains: query } },
              { code: { contains: query } },
            ],
          }
        : undefined,
      select: {
        id: true,
        name: true,
        code: true,
        unit: true,
      },
      orderBy: hasTerm ? { name: 'asc' } : { id: 'desc' },
      take: limit,
    }),
  ]);

  res.json({
    query,
    purchaseOrders: orders.map(order => ({
      id: order.id,
      processId: order.processId,
      processName: order.process?.name ?? null,
      processCode: order.process?.code ?? null,
      supplierName: order.supplierName,
      orderNumber: order.orderNumber,
      issueDate: order.issueDate,
      currency: order.currency,
      total: decimalToNumber(order.total),
    })),
    suppliers: suppliers.map(supplier => ({
      id: supplier.id,
      name: supplier.name,
      ruc: supplier.ruc ?? null,
      phone: supplier.phone ?? null,
    })),
    quotations: quotations.map(quotation => ({
      id: quotation.id,
      processId: quotation.processId,
      processName: quotation.process?.name ?? null,
      processCode: quotation.process?.code ?? null,
      supplierName: quotation.supplierName ?? quotation.proveedor?.name ?? null,
      status: quotation.status,
      currency: quotation.currency,
      totalAmount: decimalToNumber(quotation.totalAmountPen ?? quotation.totalAmount),
    })),
    employees: employees.map(employee => ({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      area: employee.area,
      phone: employee.phone ?? null,
      documentNumber: employee.documentNumber ?? null,
      accountNumber: employee.accountNumber ?? null,
      cci: employee.cci ?? null,
    })),
    materials: materials.map(material => ({
      id: material.id,
      name: material.name,
      code: material.code ?? null,
      unit: material.unit ?? null,
    })),
  });
});

export default router;
