import { Router, Request, Response } from 'express';
import { Prisma, ExpenseKind, DocType as PrismaDocType } from '@prisma/client';
import prisma from '../db';

const router = Router();

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

/**
 * GET /api/admin/summary?obraId=1&from=2025-10-01&to=2025-10-31
 * Devuelve resumen: ingresos, egresos, margen y egresos por categoría.
 */
router.get('/admin/summary', async (req: Request, res: Response) => {
  try {
    const obraId = req.query.obraId ? Number(req.query.obraId) : undefined;
    const from = req.query.from ? parseLocalDate(String(req.query.from)) : undefined;
    const to = req.query.to ? parseLocalDate(String(req.query.to)) : undefined;

    const dateFilter: Prisma.DateTimeFilter | undefined = (() => {
      if (!from && !to) return undefined;
      const filter: Prisma.DateTimeFilter = {};
      if (from) filter.gte = from;
      if (to) {
        const nextDay = new Date(to);
        nextDay.setDate(to.getDate() + 1);
        filter.lt = nextDay;
      }
      return filter;
    })();

    const incomeWhere: Prisma.IncomeWhereInput = {
      ...(obraId ? { obraId } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    };

    const expenseWhere: Prisma.ExpenseWhereInput = {
      ...(obraId ? { obraId } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    };

    const decimalToNumber = (value: Prisma.Decimal | null | undefined) =>
      value ? Number(value) : 0;

    const incomeAgg = await prisma.income.aggregate({
      where: incomeWhere,
      _sum: { total: true },
    });
    const ingresos = decimalToNumber(incomeAgg._sum.total);

    // Flujo diario (últimos 14 días)
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 13);
    start.setHours(0, 0, 0, 0);

    const buildDailyDateFilter = (
      filter: Prisma.DateTimeFilter | undefined
    ): Prisma.DateTimeFilter => {
      if (!filter) return { gte: start };
      const currentGte = filter.gte ? new Date(filter.gte) : undefined;
      const gte = currentGte && currentGte > start ? currentGte : start;
      return { ...filter, gte };
    };

    const dailyDateFilter = buildDailyDateFilter(dateFilter);

    const [incomes, expenses] = await Promise.all([
      prisma.income.findMany({
        where: {
          ...(obraId ? { obraId } : {}),
          date: dailyDateFilter,
        },
        select: { date: true, total: true },
      }),
      prisma.expense.findMany({
        where: {
          ...(obraId ? { obraId } : {}),
          date: dailyDateFilter,
        },
        select: {
          date: true,
          total: true,
          category: { select: { kind: true, name: true } },
        },
      }),
    ]);

    const roundTo2 = (value: number) => Math.round(value * 100) / 100;

    const sumByKind = async (kinds: ExpenseKind | ExpenseKind[]) => {
      const kindList = Array.isArray(kinds) ? kinds : [kinds];
      const agg = await prisma.expense.aggregate({
        where: {
          ...expenseWhere,
          category: { kind: { in: kindList } },
        },
        _sum: { total: true },
      });
      return decimalToNumber(agg._sum.total);
    };

    const [egresosCompras, egresosConsumo, egresosOperativos, creditoFiscalAgg] =
      await Promise.all([
        sumByKind(ExpenseKind.MATERIAL_COMPRA),
        sumByKind(ExpenseKind.MATERIAL_CONSUMO),
        sumByKind([
          ExpenseKind.OPERATIVO,
          ExpenseKind.ADMINISTRATIVO,
          ExpenseKind.FINANCIERO,
          ExpenseKind.OTROS,
        ]),
        prisma.expense.aggregate({
          where: {
            ...expenseWhere,
            docType: PrismaDocType.FACTURA,
            isTaxable: true,
          },
          _sum: { base: true, igv: true, total: true },
          _count: { id: true },
        }),
      ]);

    const egresos = egresosCompras + egresosConsumo + egresosOperativos;
    const margen = ingresos - egresos;
    const margenPct = ingresos > 0 ? roundTo2((margen / ingresos) * 100) : 0;
    const operativosPct = ingresos > 0 ? roundTo2((egresosOperativos / ingresos) * 100) : 0;
    const comprasBaseGravada = decimalToNumber(creditoFiscalAgg._sum.base);
    const comprasIgv = decimalToNumber(creditoFiscalAgg._sum.igv);
    const comprasTotal = decimalToNumber(creditoFiscalAgg._sum.total);
    const facturasConIgv = creditoFiscalAgg._count?.id ?? 0;

    const flujo = Array.from({ length: 14 }).map((_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = date.toISOString().split('T')[0];

      const ingresosDia = incomes
        .filter(r => r.date.toISOString().split('T')[0] === key)
        .reduce((acc, curr) => acc + decimalToNumber(curr.total), 0);
      const gastosDia = expenses.filter(r => r.date.toISOString().split('T')[0] === key);
      const comprasDia = gastosDia
        .filter(r => r.category?.kind === ExpenseKind.MATERIAL_COMPRA)
        .reduce((acc, curr) => acc + decimalToNumber(curr.total), 0);
      const consumoDia = gastosDia
        .filter(r => r.category?.kind === ExpenseKind.MATERIAL_CONSUMO)
        .reduce((acc, curr) => acc + decimalToNumber(curr.total), 0);
      const operativosDia = gastosDia
        .filter(
          r =>
            r.category?.kind === ExpenseKind.OPERATIVO ||
            r.category?.kind === ExpenseKind.ADMINISTRATIVO ||
            r.category?.kind === ExpenseKind.FINANCIERO ||
            r.category?.kind === ExpenseKind.OTROS,
        )
        .reduce((acc, curr) => acc + decimalToNumber(curr.total), 0);
      const egresosDia = comprasDia + consumoDia + operativosDia;

      return {
        date: key,
        ingresos: ingresosDia,
        compras: comprasDia,
        consumo: consumoDia,
        operativos: operativosDia,
        egresos: egresosDia,
        neto: ingresosDia - egresosDia,
      };
    });

    const categoryTotals = await prisma.expense.groupBy({
      by: ['categoryId'],
      where: expenseWhere,
      _sum: { total: true },
    });

    const catIds = categoryTotals
      .map(c => c.categoryId)
      .filter((id): id is number => id !== null);
    const categories = catIds.length
      ? await prisma.expenseCategory.findMany({ where: { id: { in: catIds } } })
      : [];

    const dataByCat = categoryTotals.map(c => {
      const category =
        c.categoryId != null
          ? categories.find(cat => cat.id === c.categoryId)
          : null;
      return {
        category: category?.name ?? 'Sin categoría',
        kind: category?.kind ?? 'OTROS',
        amount: decimalToNumber(c._sum.total),
      };
    });

    const top5 = dataByCat.sort((a, b) => b.amount - a.amount).slice(0, 5);

    const alerts: Array<{ level: 'info' | 'warn' | 'danger'; title: string; detail: string }> = [];
    if (margen < 0) {
      alerts.push({
        level: 'danger',
        title: 'Margen negativo',
        detail: `La obra está en pérdida por S/ ${Math.abs(roundTo2(margen)).toLocaleString('es-PE')}.`,
      });
    }
    if (operativosPct > 20) {
      alerts.push({
        level: 'warn',
        title: 'Gastos operativos altos',
        detail: `Los gastos operativos representan ${operativosPct}% de los ingresos.`,
      });
    }
    const consumoSobreCompras = egresosCompras > 0 ? (egresosConsumo / egresosCompras) * 100 : 0;
    if (egresosCompras > 0 && consumoSobreCompras > 120) {
      alerts.push({
        level: 'warn',
        title: 'Consumo supera compras',
        detail: 'El consumo valorizado supera la inversión reciente en materiales. Revisa salidas.',
      });
    }

    res.json({
      totales: {
        ingresos,
        egresosCompras,
        egresosConsumo,
        egresosOperativos,
        egresos,
        margen,
        margenPct,
        operativosPct,
        comprasBaseGravada,
        comprasIgv,
        comprasTotal,
        facturasConIgv,
      },
      egresosPorCategoria: top5,
      flujo,
      alerts,
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Error generando resumen', detail: error.message });
  }
});

export default router;
