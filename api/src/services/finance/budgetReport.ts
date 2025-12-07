import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../../db';

export type BudgetItem = {
  group: string;
  code: string | null;
  description: string;
  unit: string | null;
  qtyContractual: number | null;
  qtyMetrado: number | null;
  additions?: { quantity: number | null; total: number | null } | null;
  newItems?: { quantity: number | null; total: number | null } | null;
  deductions?: { quantity: number | null; total: number | null } | null;
  bindingDeduction?: { quantity: number | null; total: number | null } | null;
  observation?: string | null;
};

export type BudgetDataset = {
  generatedAt: string;
  items: BudgetItem[];
};

type BudgetSummary = {
  group: string;
  count: number;
  contractual: number;
  metrado: number;
  additions: number;
  newItems: number;
  deductions: number;
  binding: number;
};

const datasetPath = path.join(
  process.cwd(),
  'api',
  'backups',
  'cotizaciones',
  'normalized_budget.json',
);
const enrichedPath = path.join(
  process.cwd(),
  'api',
  'backups',
  'cotizaciones',
  'budget_with_apu_enriched.json',
);
const dailyCostPath = path.join(
  process.cwd(),
  'api',
  'backups',
  'cotizaciones',
  'daily_cost_report.json',
);
const categories = ['materials', 'labor', 'equipment', 'feeding', 'lodging', 'logistics', 'other'] as const;

let cachedDataset: { mtimeMs: number; data: BudgetDataset } | null = null;
let cachedEnriched: { mtimeMs: number; data: any } | null = null;
let cachedDailyCost: { mtimeMs: number; data: any } | null = null;

const readDataset = (): BudgetDataset => {
  const stats = fs.statSync(datasetPath);
  if (cachedDataset && cachedDataset.mtimeMs === stats.mtimeMs) {
    return cachedDataset.data;
  }
  const payload = JSON.parse(fs.readFileSync(datasetPath, 'utf8')) as BudgetDataset;
  cachedDataset = { mtimeMs: stats.mtimeMs, data: payload };
  return payload;
};

const readEnrichedDataset = () => {
  const stats = fs.statSync(enrichedPath);
  if (cachedEnriched && cachedEnriched.mtimeMs === stats.mtimeMs) {
    return cachedEnriched.data;
  }
  const payload = JSON.parse(fs.readFileSync(enrichedPath, 'utf8'));
  cachedEnriched = { mtimeMs: stats.mtimeMs, data: payload };
  return payload;
};

const safeNumber = (value: number | null | undefined) => (typeof value === 'number' ? value : 0);

const decimalToNumber = (value?: Prisma.Decimal | number | string | bigint | null) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value) || 0;
  return Number(value);
};

const isMissingTableError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

const normalizeText = (text?: string | null) =>
  (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

type CategoryKey = (typeof categories)[number];

const classifyExpenseCategory = (name?: string | null): CategoryKey => {
  const slug = normalizeText(name);
  if (!slug) return 'other';
  if (slug.includes('alimenta') || slug.includes('viatic')) return 'feeding';
  if (slug.includes('alquiler') || slug.includes('servicio') || slug.includes('hosped')) return 'lodging';
  if (slug.includes('logistic') || slug.includes('transporte') || slug.includes('flete') || slug.includes('combustible')) {
    return slug.includes('combustible') ? 'equipment' : 'logistics';
  }
  if (slug.includes('maquinaria') || slug.includes('equipo')) return 'equipment';
  if (slug.includes('planilla') || slug.includes('mano de obra') || slug.includes('rrhh')) return 'labor';
  if (slug.includes('material')) return 'materials';
  return 'other';
};

export const getBudgetSummary = () => {
  const { items } = readDataset();
  const summaryMap = new Map<string, BudgetSummary>();
  items.forEach(item => {
    const group = item.group || 'UNKNOWN';
    const current =
      summaryMap.get(group) ?? {
        group,
        count: 0,
        contractual: 0,
        metrado: 0,
        additions: 0,
        newItems: 0,
        deductions: 0,
        binding: 0,
      };
    current.count += 1;
    current.contractual += safeNumber(item.qtyContractual);
    current.metrado += safeNumber(item.qtyMetrado);
    current.additions += safeNumber(item.additions?.quantity);
    current.newItems += safeNumber(item.newItems?.quantity);
    current.deductions += safeNumber(item.deductions?.quantity);
    current.binding += safeNumber(item.bindingDeduction?.quantity);
    summaryMap.set(group, current);
  });
  const groups = Array.from(summaryMap.values());
  const overall = groups.reduce(
    (acc, cur) => ({
      count: acc.count + cur.count,
      contractual: acc.contractual + cur.contractual,
      metrado: acc.metrado + cur.metrado,
      additions: acc.additions + cur.additions,
      newItems: acc.newItems + cur.newItems,
      deductions: acc.deductions + cur.deductions,
      binding: acc.binding + cur.binding,
    }),
    {
      count: 0,
      contractual: 0,
      metrado: 0,
      additions: 0,
      newItems: 0,
      deductions: 0,
      binding: 0,
    },
  );
  return { groups, overall };
};

export const getBudgetItems = (filters?: { group?: string }) => {
  const { items } = readDataset();
  if (!filters?.group) return items;
  return items.filter(item => item.group === filters.group);
};

export const getDailyCostReport = () => {
  try {
    const stats = fs.statSync(dailyCostPath);
    if (cachedDailyCost && cachedDailyCost.mtimeMs === stats.mtimeMs) {
      return cachedDailyCost.data;
    }
    const payload = JSON.parse(fs.readFileSync(dailyCostPath, 'utf8'));
    cachedDailyCost = { mtimeMs: stats.mtimeMs, data: payload };
    return payload;
  } catch (error) {
    return { generatedAt: new Date().toISOString(), entries: [] };
  }
};

const normalizeKey = (group?: string | null, code?: string | null, description?: string | null) =>
  `${group ?? 'UNKNOWN'}|${(code ?? '').toLowerCase()}|${(description ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')}`.trim();

const computeUnitBudgetCost = (components?: Array<{ quantity?: number | null; unitCost?: number | null; partial?: number | null }>) => {
  if (!Array.isArray(components)) return null;
  return components.reduce((acc, component) => {
    if (typeof component.partial === 'number') {
      return acc + component.partial;
    }
    if (typeof component.quantity === 'number' && typeof component.unitCost === 'number') {
      return acc + component.quantity * component.unitCost;
    }
    return acc;
  }, 0);
};

type PerformanceBucket = {
  group: string;
  code: string | null;
  description: string;
  unit: string | null;
  sheetName?: string | null;
  plannedQty: number | null;
  budgetQty: number | null;
  executedQty: number;
  puBudget: number | null;
  totals: Record<(typeof categories)[number], number>;
};

type OverallSummary = {
  executedQty: number;
  totalReal: number;
  totalBudget: number;
  byCategory: Record<CategoryKey, number>;
  coverage?: number | null;
  variance?: number | null;
};

const ensureBucket = (
  map: Map<string, PerformanceBucket>,
  key: string,
  seed: {
    group?: string | null;
    code?: string | null;
    description?: string | null;
    unit?: string | null;
    sheetName?: string | null;
  } = {},
) => {
  const current = map.get(key);
  if (current) return current;
  const bucket: PerformanceBucket = {
    group: seed.group ?? 'UNKNOWN',
    code: seed.code ?? null,
    description: seed.description ?? 'Sin descripción',
    unit: seed.unit ?? null,
    sheetName: seed.sheetName ?? null,
    plannedQty: null,
    budgetQty: null,
    executedQty: 0,
    puBudget: null,
    totals: categories.reduce(
      (acc, category) => ({ ...acc, [category]: 0 }),
      {} as PerformanceBucket['totals'],
    ),
  };
  map.set(key, bucket);
  return bucket;
};

const fetchDeliveries = async () => {
  try {
    return await prisma.purchaseDeliveryItem.findMany({
      include: {
        orderLine: {
          select: {
            unitPrice: true,
            quantity: true,
            totalPrice: true,
            description: true,
            metadata: true,
          },
        },
        baseline: {
          select: {
            description: true,
            unit: true,
            quantity: true,
            sheetName: true,
          },
        },
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
};

const fetchPayrollEntries = async () => {
  try {
    return await prisma.payrollEntry.findMany({ select: { netPay: true } });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
};

const fetchExpenses = async () => {
  try {
    return await prisma.expense.findMany({
      select: {
        total: true,
        category: { select: { name: true } },
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
};

const fetchFoodPools = async () => {
  try {
    return await prisma.foodCostPool.findMany({
      select: { amount: true, type: true },
    });
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
};

const mapFoodPoolCategory = (type?: string | null): CategoryKey => {
  switch (type) {
    case 'MANO_OBRA':
      return 'labor';
    case 'ALQUILER':
    case 'SERVICIOS_BASICOS':
      return 'lodging';
    case 'LOGISTICA':
    case 'TRANSPORTE':
      return 'logistics';
    case 'COMBUSTIBLE':
      return 'equipment';
    case 'SUMINISTROS':
      return 'feeding';
    default:
      return 'other';
  }
};

export const getRealCostPerformance = async () => {
  const enriched = readEnrichedDataset();
  const bucketMap = new Map<string, PerformanceBucket>();
  const aliasMap = new Map<string, string>();

  const registerAlias = (key: string, description?: string | null) => {
    if (!description) return;
    aliasMap.set(normalizeKey(null, null, description), key);
  };

  const resolveBucketKey = (
    group: string | null | undefined,
    code: string | null | undefined,
    description: string,
  ) => {
    const candidate = normalizeKey(group, code, description);
    if (bucketMap.has(candidate)) return candidate;
    const alias = aliasMap.get(normalizeKey(null, null, description));
    return alias ?? candidate;
  };

  if (enriched?.items?.length) {
    enriched.items.forEach((item: any) => {
      const key = normalizeKey(item.group, item.code, item.description);
      const bucket = ensureBucket(bucketMap, key, { ...item, sheetName: item.sheetName ?? item.group ?? null });
      registerAlias(key, item.description);
      const qtyBudget = typeof item.qtyMetrado === 'number' ? item.qtyMetrado : item.qtyContractual;
      if (typeof qtyBudget === 'number' && qtyBudget > 0) {
        bucket.budgetQty = qtyBudget;
      }
      if (item.unit && !bucket.unit) bucket.unit = item.unit;
      if (!bucket.sheetName && item.sheetName) bucket.sheetName = item.sheetName;
      const puFromComponents = computeUnitBudgetCost(item.components);
      if (typeof puFromComponents === 'number' && puFromComponents > 0) {
        bucket.puBudget = puFromComponents;
      }
    });
  }

  const [deliveries, payrollEntries, expenses, foodPools] = await Promise.all([
    fetchDeliveries(),
    fetchPayrollEntries(),
    fetchExpenses(),
    fetchFoodPools(),
  ]);

  deliveries.forEach(item => {
    const description = item.baseline?.description ?? item.description ?? 'Ítem sin descripción';
    const bucketKey = resolveBucketKey(item.baseline?.sheetName ?? null, null, description);
    const bucket = ensureBucket(bucketMap, bucketKey, {
      group: item.baseline?.sheetName ?? 'MATERIALES',
      description,
      unit: item.baseline?.unit ?? item.unit ?? null,
      sheetName: item.baseline?.sheetName ?? null,
    });
    registerAlias(bucketKey, description);
    if (!bucket.unit && item.baseline?.unit) bucket.unit = item.baseline.unit;
    if (!bucket.budgetQty && item.baseline?.quantity) {
      bucket.budgetQty = decimalToNumber(item.baseline.quantity);
    }
    const qty = decimalToNumber(item.quantity);
    const resolvedUnitPrice = item.orderLine
      ? decimalToNumber(item.orderLine.unitPrice)
          || (item.orderLine.totalPrice && item.orderLine.quantity
            ? decimalToNumber(item.orderLine.totalPrice)
              / Math.max(decimalToNumber(item.orderLine.quantity) || 1, 1)
            : null)
      : null;
    const materialCost = resolvedUnitPrice !== null ? qty * resolvedUnitPrice : 0;
    if (!bucket.puBudget && typeof resolvedUnitPrice === 'number' && resolvedUnitPrice > 0) {
      bucket.puBudget = resolvedUnitPrice;
    }
    bucket.executedQty += qty;
    bucket.totals.materials += materialCost;
  });

  const expenseTotals = categories.reduce(
    (acc, category) => ({ ...acc, [category]: 0 }),
    {} as Record<CategoryKey, number>,
  );

  expenses.forEach(expense => {
    const amount = decimalToNumber(expense.total);
    if (!amount) return;
    const category = classifyExpenseCategory(expense.category?.name);
    expenseTotals[category] += amount;
  });

  foodPools.forEach(pool => {
    const amount = decimalToNumber(pool.amount);
    if (!amount) return;
    const category = mapFoodPoolCategory(pool.type);
    expenseTotals[category] += amount;
  });

  const payrollTotal = payrollEntries.reduce((acc, entry) => acc + decimalToNumber(entry.netPay), 0);
  if (payrollTotal > 0) {
    expenseTotals.labor += payrollTotal;
  }

  const expenseLabels: Record<CategoryKey, string> = {
    materials: 'Compras y consumos sin OC',
    labor: 'Planillas y RR.HH.',
    equipment: 'Equipos y maquinaria',
    feeding: 'Alimentación y viáticos',
    lodging: 'Alojamiento y servicios generales',
    logistics: 'Transporte y logística',
    other: 'Otros gastos operativos',
  };

  (Object.entries(expenseLabels) as Array<[CategoryKey, string]>).forEach(([categoryKey, label]) => {
    const amount = expenseTotals[categoryKey];
    if (!amount) return;
    const key = normalizeKey('GASTOS', categoryKey, label);
    const bucket = ensureBucket(bucketMap, key, {
      group: 'GASTOS',
      code: categoryKey.toUpperCase(),
      description: label,
      sheetName: 'GASTOS',
    });
    registerAlias(key, label);
    bucket.totals[categoryKey] += amount;
  });

  const items = Array.from(bucketMap.values())
    .map(bucket => {
      const totalReal = categories.reduce((acc, category) => acc + bucket.totals[category], 0);
      const totalBudget =
        typeof bucket.budgetQty === 'number' && typeof bucket.puBudget === 'number'
          ? bucket.budgetQty * bucket.puBudget
          : null;
      const coverage =
        typeof bucket.budgetQty === 'number' && bucket.budgetQty > 0
          ? bucket.executedQty / bucket.budgetQty
          : null;
      const puReal = bucket.executedQty > 0 ? totalReal / bucket.executedQty : null;
      const variance = typeof totalBudget === 'number' ? totalReal - totalBudget : null;
      const status =
        coverage === null
          ? 'SIN_PRESUPUESTO'
          : coverage >= 1
            ? 'COMPLETADO'
            : coverage >= 0.8
              ? 'ALTA'
              : coverage >= 0.5
                ? 'MEDIA'
                : 'BAJA';
      return {
        group: bucket.group,
        code: bucket.code,
        description: bucket.description,
        unit: bucket.unit,
        sheetName: bucket.sheetName,
        budgetQty: bucket.budgetQty,
        executedQty: Number(bucket.executedQty.toFixed(2)),
        coverage,
        plannedQty: bucket.plannedQty,
        puBudget: bucket.puBudget,
        puReal,
        totalBudget,
        totalReal,
        variance,
        status,
        costBreakdown: bucket.totals,
      };
    })
    .filter(item => (item.budgetQty ?? 0) > 0 || item.executedQty > 0)
    .sort((a, b) => (Math.abs(b.variance ?? 0) - Math.abs(a.variance ?? 0)) || (b.coverage ?? 0) - (a.coverage ?? 0));

  const overall = items.reduce<OverallSummary>(
    (acc, item) => {
      acc.executedQty += item.executedQty ?? 0;
      acc.totalReal += item.totalReal ?? 0;
      acc.totalBudget += item.totalBudget ?? 0;
      categories.forEach(category => {
        acc.byCategory[category] += item.costBreakdown[category] ?? 0;
      });
      return acc;
    },
    {
      executedQty: 0,
      totalReal: 0,
      totalBudget: 0,
      byCategory: categories.reduce(
        (acc, category) => ({ ...acc, [category]: 0 }),
        {} as Record<CategoryKey, number>,
      ),
    },
  );

  overall.coverage = overall.totalBudget > 0 ? overall.totalReal / overall.totalBudget : null;
  overall.variance = overall.totalBudget > 0 ? overall.totalReal - overall.totalBudget : null;

  const tramoMap = new Map<
    string,
    { tramo: string; executedQty: number; totalReal: number; sheetName: string }
  >();

  items.forEach(item => {
    const key = item.sheetName ?? item.group ?? 'GENERAL';
    if (!tramoMap.has(key)) {
      tramoMap.set(key, {
        tramo: key,
        executedQty: 0,
        totalReal: 0,
        sheetName: key,
      });
    }
    const current = tramoMap.get(key)!;
    current.executedQty += item.executedQty ?? 0;
    current.totalReal += item.totalReal ?? 0;
  });

  const tramoSummary = Array.from(tramoMap.values())
    .map(row => ({
      tramo: row.tramo,
      executedQty: Number(row.executedQty.toFixed(2)),
      totalReal: row.totalReal,
      puReal: row.executedQty > 0 ? row.totalReal / row.executedQty : null,
    }))
    .sort((a, b) => (b.totalReal ?? 0) - (a.totalReal ?? 0));

  return {
    generatedAt: new Date().toISOString(),
    overall,
    items,
    tramoSummary,
  };
};
