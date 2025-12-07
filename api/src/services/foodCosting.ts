import type { FoodCostPeriod, FoodMealType, PoolAllocationMethod, Prisma } from '@prisma/client';
import prisma from '../db';

export type IngredientCostLine = {
  itemId: number;
  ingredientId: number;
  name: string;
  unit?: string | null;
  quantity: number;
  wastePct: number;
  unitCost: number;
  grossCost: number;
  netQuantity: number;
  perPortion: number;
};

export type ComponentCostLine = {
  itemId: number;
  recipeId: number;
  name: string;
  quantity: number;
  unit?: string | null;
  batchCost: number;
  perPortion: number;
};

export type ExtraCostLine = {
  id: number;
  label: string;
  period: FoodCostPeriod;
  amount: number;
  periodRations?: number | null;
  totalCost: number;
  perPortion: number;
};

export type PoolCostLine = {
  id: number;
  name: string;
  type: string;
  period: FoodCostPeriod;
  amount: number;
  periodRations?: number | null;
  totalCost: number;
  perPortion: number;
};

export type RecipeCostSummary = {
  recipe: {
    id: number;
    name: string;
    mealType: string;
    yield: number;
    yieldUnit?: string | null;
    notes?: string | null;
  };
  totals: {
    ingredients: number;
    components: number;
    manualExtras: number;
    pools: number;
    batchTotal: number;
    perPortion: number;
  };
  ingredients: IngredientCostLine[];
  components: ComponentCostLine[];
  extras: ExtraCostLine[];
  pools: PoolCostLine[];
};

type CostingContext = {
  visited: Set<number>;
  cache: Map<number, RecipeCostSummary>;
};

const decimalToNumber = (value?: Prisma.Decimal | number | null) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number(value);
};

const resolvePerPortionFromPeriod = (
  amount: number,
  period: FoodCostPeriod,
  periodRations: number | null | undefined,
  defaultRations: number,
) => {
  if (amount === 0) return 0;
  if (period === 'POR_RACION') return amount;

  const rations = periodRations && periodRations > 0 ? periodRations : defaultRations;
  if (!rations || rations <= 0) return 0;

  return amount / rations;
};

const normalizeUnitToken = (value?: string | null) =>
  value?.toLowerCase().trim().replace(/[^a-z]/g, '') ?? '';

type UnitCategory =
  | 'kg'
  | 'g'
  | 'mg'
  | 'litro'
  | 'ml'
  | 'teaspoon'
  | 'tablespoon'
  | 'cup'
  | 'unidad'
  | 'docena'
  | 'lata';

const SPECIAL_UNIT_FACTORS: Record<string, { base: UnitCategory; amount: number }> = {
  pinch: { base: 'kg', amount: 0.0005 },
  pizca: { base: 'kg', amount: 0.0005 },
  pizquita: { base: 'kg', amount: 0.0005 },
  pellizco: { base: 'kg', amount: 0.0005 },
  dash: { base: 'litro', amount: 0.001 },
  chorrito: { base: 'litro', amount: 0.01 },
  gota: { base: 'litro', amount: 0.00005 },
  gotas: { base: 'litro', amount: 0.00005 },
  unidad: { base: 'kg', amount: 0.12 },
  unidades: { base: 'kg', amount: 0.12 },
};

const WEIGHT_BY_ITEM: Record<string, number> = {
  limon: 0.06,
  lima: 0.06,
  naranja: 0.13,
  papa: 0.18,
  cebolla: 0.15,
};

const calculatePoolCost = (
  pool: {
    amount: Prisma.Decimal | number;
    period: FoodCostPeriod;
    periodRations?: Prisma.Decimal | number | null;
    allocationMethod?: PoolAllocationMethod | null;
    dailyBlocks?: number | null;
    timeMinutes?: Prisma.Decimal | number | null;
  },
  recipeYield: number,
  recipePrepMinutes: number,
  recipeBlocks: number,
) => {
  const amount = decimalToNumber(pool.amount);
  if (!amount) return { totalCost: 0, perPortion: 0 };
  const method = pool.allocationMethod ?? 'RACIONES';
  if (method === 'BLOQUES') {
    const totalBlocks = pool.dailyBlocks && pool.dailyBlocks > 0 ? pool.dailyBlocks : 1;
    const activeBlocks = recipeBlocks > 0 ? recipeBlocks : 1;
    const blockCost = amount / totalBlocks;
    const totalCost = blockCost * activeBlocks;
    return { totalCost, perPortion: recipeYield > 0 ? totalCost / recipeYield : totalCost };
  }
  if (method === 'MINUTOS') {
    const totalMinutes = decimalToNumber(pool.timeMinutes);
    if (totalMinutes > 0 && recipePrepMinutes > 0) {
      const totalCost = (amount * recipePrepMinutes) / totalMinutes;
      return { totalCost, perPortion: recipeYield > 0 ? totalCost / recipeYield : totalCost };
    }
  }

  const perPortion = resolvePerPortionFromPeriod(
    amount,
    pool.period,
    pool.periodRations ? decimalToNumber(pool.periodRations) : null,
    recipeYield,
  );
  const totalCost = perPortion * recipeYield;
  return { totalCost, perPortion };
};

const resolveUnitCategory = (value?: string | null): UnitCategory | null => {
  const token = normalizeUnitToken(value);
  if (!token) return null;
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(token)) return 'kg';
  if (['g', 'gr', 'gramo', 'gramos', 'grs'].includes(token)) return 'g';
  if (['mg', 'miligramo', 'miligramos'].includes(token)) return 'mg';
  if (['litro', 'litros', 'lt', 'l'].includes(token)) return 'litro';
  if (['ml', 'mililitro', 'mililitros'].includes(token)) return 'ml';
  if (['cucharadita', 'cucharaditas', 'cdta', 'cdtas'].includes(token)) return 'teaspoon';
  if (['cucharada', 'cucharadas', 'cda', 'cdas'].includes(token)) return 'tablespoon';
  if (['taza', 'tazas'].includes(token)) return 'cup';
  if (['unidad', 'unid', 'u', 'unidades'].includes(token)) return 'unidad';
  if (['docena', 'docenas'].includes(token)) return 'docena';
  if (['lata', 'latas'].includes(token)) return 'lata';
  return null;
};

const convertToBaseQuantity = (
  quantity: number,
  recipeUnit?: string | null,
  ingredientUnit?: string | null,
) => {
  if (!quantity) return 0;
  const normalizedRecipeToken = normalizeUnitToken(recipeUnit);
  const special = normalizedRecipeToken ? SPECIAL_UNIT_FACTORS[normalizedRecipeToken] : null;
  const ingToken = normalizeUnitToken(ingredientUnit);
  const weightOverride = ingToken === 'kg' && WEIGHT_BY_ITEM[normalizedRecipeToken] ? WEIGHT_BY_ITEM[normalizedRecipeToken] : null;
  const base = resolveUnitCategory(ingredientUnit) ?? special?.base ?? (weightOverride ? 'kg' : resolveUnitCategory(recipeUnit));
  const recipe = resolveUnitCategory(recipeUnit) ?? special?.base ?? base;
  if (!base) {
    return special ? quantity * special.amount : quantity;
  }

  if (special && special.base === base) {
    return quantity * special.amount;
  }

  if (weightOverride && recipe === 'unidad') {
    return quantity * weightOverride;
  }

  if (base === 'kg') {
    if (recipe === 'kg') return quantity;
    if (recipe === 'g') return quantity / 1000;
    if (recipe === 'mg') return quantity / 1_000_000;
    if (recipe === 'teaspoon') return quantity * 0.005; // 5 g aprox
    if (recipe === 'tablespoon') return quantity * 0.015; // 15 g aprox
    if (recipe === 'cup') return quantity * 0.25; // 250 g aprox
    if (recipe === 'litro') return quantity; // sin densidad definida
    if (recipe === 'ml') return quantity / 1000;
  }
  if (base === 'litro') {
    if (recipe === 'litro') return quantity;
    if (recipe === 'ml') return quantity / 1000;
    if (recipe === 'teaspoon') return quantity * 0.005;
    if (recipe === 'tablespoon') return quantity * 0.015;
    if (recipe === 'cup') return quantity * 0.24;
  }
  if (base === 'unidad') {
    if (recipe === 'docena') return quantity * 12;
    return quantity;
  }
  if (base === 'lata') {
    return quantity;
  }
  return quantity;
};

const createContext = (): CostingContext => ({
  visited: new Set<number>(),
  cache: new Map<number, RecipeCostSummary>(),
});

export async function computeRecipeCost(recipeId: number, ctx = createContext()): Promise<RecipeCostSummary> {
  if (ctx.cache.has(recipeId)) {
    return ctx.cache.get(recipeId)!;
  }

  if (ctx.visited.has(recipeId)) {
    throw new Error('Se detectó un ciclo en las sub-recetas');
  }

  ctx.visited.add(recipeId);

  const recipe = await prisma.foodRecipe.findUnique({
    where: { id: recipeId },
    include: {
      items: {
        include: {
          ingredient: {
            include: {
              costs: {
                orderBy: { effectiveDate: 'desc' },
                take: 1,
              },
            },
          },
          childRecipe: {
            select: {
              id: true,
              name: true,
              mealType: true,
              yield: true,
              yieldUnit: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      },
      extraCosts: {
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!recipe) {
    ctx.visited.delete(recipeId);
    throw new Error('Receta no encontrada');
  }

  const recipeYield = decimalToNumber(recipe.yield) || 1;

  const ingredientLines: IngredientCostLine[] = [];
  let ingredientTotal = 0;

  const componentLines: ComponentCostLine[] = [];
  let componentTotal = 0;

  for (const item of recipe.items) {
    if (item.ingredientId && item.ingredient) {
      const name = item.ingredient.name;
      const inputQuantity = decimalToNumber(item.quantity) || 0;
      const wastePctRaw =
        item.wastePct !== null && item.wastePct !== undefined
          ? decimalToNumber(item.wastePct)
          : decimalToNumber(item.ingredient.defaultWastePct);
      const wastePct = Math.max(0, Math.min(0.95, wastePctRaw));
      const normalizedQuantity = convertToBaseQuantity(inputQuantity, item.unit, item.ingredient.unit);
      const netQuantity = normalizedQuantity * (1 - wastePct);
      const unitCost = item.ingredient.costs?.[0] ? decimalToNumber(item.ingredient.costs[0].unitCost) : 0;
      const grossCost = normalizedQuantity * unitCost;
      const perPortion = recipeYield > 0 ? grossCost / recipeYield : grossCost;

      ingredientLines.push({
        itemId: item.id,
        ingredientId: item.ingredient.id,
        name,
        unit: item.unit ?? item.ingredient.unit,
        quantity: inputQuantity,
        wastePct,
        unitCost,
        grossCost,
        netQuantity,
        perPortion,
      });
      ingredientTotal += grossCost;
    } else if (item.childRecipeId && item.childRecipe) {
      const quantity = decimalToNumber(item.quantity) || 0;
      if (quantity === 0) continue;
      const childSummary = await computeRecipeCost(item.childRecipe.id, ctx);
      const batchCost = quantity * childSummary.totals.batchTotal;
      const perPortion = recipeYield > 0 ? batchCost / recipeYield : batchCost;

      componentLines.push({
        itemId: item.id,
        recipeId: item.childRecipe.id,
        name: item.childRecipe.name,
        quantity,
        unit: item.unit ?? 'batch',
        batchCost,
        perPortion,
      });
      componentTotal += batchCost;
    }
  }

  const extraLines: ExtraCostLine[] = [];
  let extraTotal = 0;
  for (const extra of recipe.extraCosts) {
    const amount = decimalToNumber(extra.amount);
    const period = extra.period;
    const periodRations = extra.periodRations ? decimalToNumber(extra.periodRations) : null;
    const perPortion = resolvePerPortionFromPeriod(amount, period, periodRations, recipeYield);
    const totalCost = perPortion * recipeYield;
    extraLines.push({
      id: extra.id,
      label: extra.label,
      period,
      amount,
      periodRations,
      totalCost,
      perPortion,
    });
    extraTotal += totalCost;
  }

  const pools = await prisma.foodCostPool.findMany({
    where: {
      OR: [
        { appliesTo: null },
        { appliesTo: recipe.mealType },
      ],
    },
    orderBy: { name: 'asc' },
  });

  const poolLines: PoolCostLine[] = [];
  let poolTotal = 0;
  const recipePrepMinutes = decimalToNumber(recipe.prepMinutes);
  const recipeBlocks = recipe.dailyBlocks ?? 1;
  for (const pool of pools) {
    const { totalCost, perPortion } = calculatePoolCost(
      pool,
      recipeYield,
      recipePrepMinutes,
      recipeBlocks ?? 1,
    );
    poolLines.push({
      id: pool.id,
      name: pool.name,
      type: pool.type,
      period: pool.period,
      amount: decimalToNumber(pool.amount),
      periodRations: pool.periodRations ? decimalToNumber(pool.periodRations) : null,
      totalCost,
      perPortion,
    });
    poolTotal += totalCost;
  }

  const batchTotal = ingredientTotal + componentTotal + extraTotal + poolTotal;
  const perPortion = recipeYield > 0 ? batchTotal / recipeYield : batchTotal;

  const summary: RecipeCostSummary = {
    recipe: {
      id: recipe.id,
      name: recipe.name,
      mealType: recipe.mealType,
      yield: recipeYield,
      yieldUnit: recipe.yieldUnit,
      notes: recipe.notes,
    },
    totals: {
      ingredients: ingredientTotal,
      components: componentTotal,
      manualExtras: extraTotal,
      pools: poolTotal,
      batchTotal,
      perPortion,
    },
    ingredients: ingredientLines,
    components: componentLines,
    extras: extraLines,
    pools: poolLines,
  };

  ctx.cache.set(recipeId, summary);
  ctx.visited.delete(recipeId);

  return summary;
}

type IngredientAggregate = {
  ingredientId: number | null;
  name: string;
  unit: string | null;
  quantity: number;
  netQuantity: number;
  unitCost: number;
};

const formatValue = (value: number) => Number(value.toFixed(6));

export async function computeMealPlanSummary(planId: number) {
  const plan = await prisma.foodMealPlan.findUnique({
    where: { id: planId },
    include: {
      entries: {
        include: {
          recipe: {
            include: {
              items: {
                include: {
                  ingredient: {
                    include: {
                      costs: {
                        orderBy: { effectiveDate: 'desc' },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ dayIndex: 'asc' }, { mealType: 'asc' }],
      },
    },
  });

  if (!plan) {
    throw new Error('Plan de alimentación no encontrado');
  }

  const ingredientMap = new Map<number | string, IngredientAggregate>();
  const recipeCostCache = new Map<number, RecipeCostSummary>();
  const entrySummaries: Array<{
    dayIndex: number;
    mealType: FoodMealType;
    recipeId: number;
    recipeName: string;
    servings: number;
    cost: number;
  }> = [];

  let totalServings = 0;
  let totalCost = 0;

  for (const entry of plan.entries) {
    if (!entry.recipe) continue;
    const recipeYield = decimalToNumber(entry.recipe.yield) || 1;
    const servings = decimalToNumber(entry.servings) || 0;
    if (!servings) continue;
    totalServings += servings;
    const factor = servings / recipeYield;

    let recipeCost = recipeCostCache.get(entry.recipeId);
    if (!recipeCost) {
      recipeCost = await computeRecipeCost(entry.recipeId);
      recipeCostCache.set(entry.recipeId, recipeCost);
    }
    const entryCost = recipeCost.totals.batchTotal * factor;
    totalCost += entryCost;

    entrySummaries.push({
      dayIndex: entry.dayIndex,
      mealType: entry.mealType,
      recipeId: entry.recipeId,
      recipeName: entry.recipe.name,
      servings,
      cost: entryCost,
    });

    for (const item of entry.recipe.items) {
      if (!item.ingredient) continue;
      const inputQuantity = decimalToNumber(item.quantity) || 0;
      if (!inputQuantity) continue;
      const normalizedQuantity = convertToBaseQuantity(inputQuantity, item.unit, item.ingredient.unit);
      if (!normalizedQuantity) continue;
      const purchaseQty = normalizedQuantity * factor;
      const wastePctRaw =
        item.wastePct !== null && item.wastePct !== undefined
          ? decimalToNumber(item.wastePct)
          : decimalToNumber(item.ingredient.defaultWastePct);
      const wastePct = Math.max(0, Math.min(0.95, wastePctRaw ?? 0));
      const netQty = purchaseQty * (1 - wastePct);
      const unitCost = item.ingredient.costs?.[0]
        ? decimalToNumber(item.ingredient.costs[0].unitCost)
        : 0;

      const key = item.ingredient.id ?? `${entry.recipeId}-${item.id}`;
      const current = ingredientMap.get(key) ?? {
        ingredientId: item.ingredient.id ?? null,
        name: item.ingredient.name,
        unit: item.ingredient.unit ?? item.unit ?? null,
        quantity: 0,
        netQuantity: 0,
        unitCost,
      };
      current.quantity = formatValue(current.quantity + purchaseQty);
      current.netQuantity = formatValue(current.netQuantity + netQty);
      if (!current.unitCost) {
        current.unitCost = unitCost;
      }
      ingredientMap.set(key, current);
    }
  }

  const ingredients = Array.from(ingredientMap.values()).map(item => ({
    ...item,
    subtotal: formatValue(item.quantity * (item.unitCost ?? 0)),
  }));
  const ingredientCost = ingredients.reduce((acc, item) => acc + item.subtotal, 0);
  const roundedTotalCost = formatValue(totalCost);

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      weekStart: plan.weekStart,
      notes: plan.notes,
    },
    totals: {
      entries: plan.entries.length,
      servings: formatValue(totalServings),
      ingredientCost: formatValue(ingredientCost),
      otherCost: formatValue(Math.max(roundedTotalCost - ingredientCost, 0)),
      totalCost: roundedTotalCost,
      perServing: totalServings ? formatValue(roundedTotalCost / totalServings) : null,
      uniqueRecipes: recipeCostCache.size,
    },
    ingredients: ingredients.sort((a, b) => b.subtotal - a.subtotal),
    entries: entrySummaries,
  };
}
