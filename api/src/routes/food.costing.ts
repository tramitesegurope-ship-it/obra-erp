import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { computeMealPlanSummary, computeRecipeCost } from '../services/foodCosting';
import { ensureFoodWasteSeeded, seedFoodWasteTable } from '../services/foodWasteSeed';
import { findWasteRecordByName } from '../lib/foodWasteTable';

const router = Router();

const MEAL_TYPES = ['DESAYUNO', 'ALMUERZO', 'CENA', 'REFRIGERIO', 'COMPONENTE'] as const;
const COST_PERIODS = ['POR_RACION', 'POR_SERVICIO', 'DIARIO', 'SEMANAL', 'MENSUAL'] as const;
const COST_POOL_TYPES = [
  'MANO_OBRA',
  'ALQUILER',
  'SERVICIOS_BASICOS',
  'LOGISTICA',
  'TRANSPORTE',
  'COMBUSTIBLE',
  'SUMINISTROS',
  'OTROS',
] as const;
const ALLOCATION_METHODS = ['RACIONES', 'BLOQUES', 'MINUTOS'] as const;
const EXTRA_COST_TYPES = ['MANO_OBRA', 'INDIRECTO', 'TRANSPORTE', 'LOGISTICA', 'SUMINISTROS', 'OTROS'] as const;

const IngredientInput = z.object({
  name: z.string().min(2).max(120),
  category: z.string().max(80).optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  defaultWastePct: z.number().min(0).max(0.95).optional(),
  notes: z.string().max(240).optional().nullable(),
});

const IngredientCostInput = z.object({
  unitCost: z.number().nonnegative(),
  effectiveDate: z.string().optional().nullable(),
  source: z.string().max(120).optional().nullable(),
});

const RecipeItemInput = z
  .object({
    ingredientId: z.number().int().positive().optional(),
    childRecipeId: z.number().int().positive().optional(),
    quantity: z.number().positive(),
    unit: z.string().max(40).optional().nullable(),
    wastePct: z.number().min(0).max(0.95).optional().nullable(),
    notes: z.string().max(200).optional().nullable(),
  })
  .refine(data => data.ingredientId || data.childRecipeId, {
    message: 'Debe seleccionar un ingrediente o una sub-receta',
    path: ['ingredientId'],
  })
  .refine(data => !(data.ingredientId && data.childRecipeId), {
    message: 'Solo puede seleccionar un ingrediente o sub-receta',
  });

const ExtraCostInput = z.object({
  label: z.string().min(2).max(120),
  amount: z.number().nonnegative(),
  costType: z.enum(EXTRA_COST_TYPES).optional(),
  period: z.enum(COST_PERIODS).optional(),
  periodRations: z.number().positive().optional().nullable(),
  notes: z.string().max(200).optional().nullable(),
});

const RecipeInput = z.object({
  name: z.string().min(2).max(150),
  code: z.string().max(50).optional().nullable(),
  mealType: z.enum(MEAL_TYPES),
  yield: z.number().positive(),
  yieldUnit: z.string().max(40).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  items: z.array(RecipeItemInput).min(1),
  extraCosts: z.array(ExtraCostInput).optional(),
  prepMinutes: z.number().nonnegative().optional().nullable(),
  dailyBlocks: z.number().positive().optional().nullable(),
});

const RecipeUpdateInput = RecipeInput.partial().extend({
  items: z.array(RecipeItemInput).optional(),
});

const CostPoolInput = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(COST_POOL_TYPES).optional(),
  amount: z.number().nonnegative(),
  period: z.enum(COST_PERIODS),
  periodRations: z.number().positive().optional().nullable(),
  appliesTo: z.enum(MEAL_TYPES).optional().nullable(),
  notes: z.string().max(250).optional().nullable(),
  allocationMethod: z.enum(ALLOCATION_METHODS).optional(),
  dailyBlocks: z.number().positive().optional().nullable(),
  timeMinutes: z.number().positive().optional().nullable(),
});

const MealPlanEntryInput = z.object({
  dayIndex: z.number().int().min(0).max(6),
  mealType: z.enum(MEAL_TYPES),
  recipeId: z.number().int().positive(),
  servings: z.number().positive(),
  notes: z.string().max(240).optional().nullable(),
});

const MealPlanInput = z.object({
  name: z.string().min(2).max(160),
  weekStart: z.string().optional().nullable(),
  notes: z.string().max(400).optional().nullable(),
  entries: z.array(MealPlanEntryInput).min(1),
});

const parseDate = (value?: string | null) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
};

const mapMealPlanDetail = (plan: any) => ({
  id: plan.id,
  name: plan.name,
  weekStart: plan.weekStart,
  notes: plan.notes,
  entries: plan.entries?.map((entry: any) => ({
    id: entry.id,
    dayIndex: entry.dayIndex,
    mealType: entry.mealType,
    recipeId: entry.recipeId,
    servings: Number(entry.servings ?? 0),
    notes: entry.notes,
    recipeName: entry.recipe?.name ?? null,
  })) ?? [],
});

router.get('/food/ingredients', async (_req, res, next) => {
  try {
    await ensureFoodWasteSeeded();
    const items = await prisma.foodIngredient.findMany({
      include: {
        costs: {
          orderBy: { effectiveDate: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    const mapped = items.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      defaultWastePct: Number(item.defaultWastePct ?? 0),
      notes: item.notes,
      latestCost: item.costs[0]?.unitCost ?? null,
      latestCostDate: item.costs[0]?.effectiveDate ?? null,
    }));

    res.json({ items: mapped });
  } catch (error) {
    next(error);
  }
});

router.post('/food/ingredients/import-defaults', async (_req, res, next) => {
  try {
    const inserted = await seedFoodWasteTable();
    res.json({ inserted });
  } catch (error) {
    next(error);
  }
});

router.post('/food/ingredients', async (req, res, next) => {
  try {
    const parsed = IngredientInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const wasteRecord = findWasteRecordByName(parsed.data.name);
    const defaultWaste = parsed.data.defaultWastePct ?? wasteRecord?.defaultWastePct ?? 0;
    const unit = parsed.data.unit ?? wasteRecord?.unit ?? null;
    const category = parsed.data.category ?? wasteRecord?.category ?? null;

    const created = await prisma.foodIngredient.create({
      data: {
        name: parsed.data.name.trim(),
        category: category ? category.trim() : null,
        unit: unit ? unit.trim() : null,
        defaultWastePct: defaultWaste,
        notes: parsed.data.notes ?? null,
      },
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/food/ingredients/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = IngredientInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const updated = await prisma.foodIngredient.update({
      where: { id },
      data: {
        name: parsed.data.name?.trim(),
        category: parsed.data.category?.trim(),
        unit: parsed.data.unit?.trim(),
        defaultWastePct: parsed.data.defaultWastePct,
        notes: parsed.data.notes,
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post('/food/ingredients/:id/costs', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = IngredientCostInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const cost = await prisma.foodIngredientCost.create({
      data: {
        ingredientId: id,
        unitCost: parsed.data.unitCost,
        effectiveDate: parseDate(parsed.data.effectiveDate),
        source: parsed.data.source ?? null,
      },
    });

    res.status(201).json(cost);
  } catch (error) {
    next(error);
  }
});

router.get('/food/ingredients/:id/costs', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const costs = await prisma.foodIngredientCost.findMany({
      where: { ingredientId: id },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ items: costs });
  } catch (error) {
    next(error);
  }
});

router.get('/food/recipes', async (_req, res, next) => {
  try {
    const recipes = await prisma.foodRecipe.findMany({
      orderBy: [{ mealType: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    res.json({ items: recipes });
  } catch (error) {
    next(error);
  }
});

router.post('/food/recipes', async (req, res, next) => {
  try {
    const parsed = RecipeInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const data = parsed.data;

    const created = await prisma.foodRecipe.create({
      data: {
        name: data.name.trim(),
        code: data.code?.trim() ?? null,
        mealType: data.mealType,
        yield: data.yield,
        yieldUnit: data.yieldUnit?.trim() ?? null,
        notes: data.notes ?? null,
        prepMinutes: data.prepMinutes ?? 0,
        dailyBlocks: data.dailyBlocks ?? 1,
        items: {
          create: data.items.map(item => ({
            ingredientId: item.ingredientId,
            childRecipeId: item.childRecipeId,
            quantity: item.quantity,
            unit: item.unit?.trim() ?? null,
            wastePct: item.wastePct ?? null,
            notes: item.notes ?? null,
          })),
        },
        extraCosts: {
          create: (data.extraCosts ?? []).map(extra => ({
            label: extra.label.trim(),
            amount: extra.amount,
            costType: extra.costType ?? 'OTROS',
            period: extra.period ?? 'POR_RACION',
            periodRations: extra.periodRations ?? null,
            notes: extra.notes ?? null,
          })),
        },
      },
      include: {
        items: true,
        extraCosts: true,
      },
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get('/food/recipes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const recipe = await prisma.foodRecipe.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { id: 'asc' },
          include: {
            ingredient: true,
            childRecipe: {
              select: { id: true, name: true, mealType: true, yield: true, yieldUnit: true },
            },
          },
        },
        extraCosts: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!recipe) return res.status(404).json({ error: 'Receta no encontrada' });

    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

router.patch('/food/recipes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = RecipeUpdateInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const data = parsed.data;

    const updated = await prisma.$transaction(async tx => {
      const base = await tx.foodRecipe.update({
        where: { id },
        data: {
          name: data.name?.trim(),
          code: data.code?.trim(),
          mealType: data.mealType,
          yield: data.yield,
          yieldUnit: data.yieldUnit?.trim(),
          notes: data.notes ?? null,
          prepMinutes: data.prepMinutes ?? undefined,
          dailyBlocks: data.dailyBlocks ?? undefined,
        },
      });

      if (data.items) {
        await tx.foodRecipeItem.deleteMany({ where: { recipeId: id } });
        await tx.foodRecipeItem.createMany({
          data: data.items.map(item => ({
            recipeId: id,
            ingredientId: item.ingredientId ?? null,
            childRecipeId: item.childRecipeId ?? null,
            quantity: item.quantity,
            unit: item.unit?.trim() ?? null,
            wastePct: item.wastePct ?? null,
            notes: item.notes ?? null,
          })),
        });
      }

      if (data.extraCosts) {
        await tx.foodRecipeCost.deleteMany({ where: { recipeId: id } });
        if (data.extraCosts.length) {
          await tx.foodRecipeCost.createMany({
            data: data.extraCosts.map(extra => ({
              recipeId: id,
              label: extra.label.trim(),
              amount: extra.amount,
              costType: extra.costType ?? 'OTROS',
              period: extra.period ?? 'POR_RACION',
              periodRations: extra.periodRations ?? null,
              notes: extra.notes ?? null,
            })),
          });
        }
      }

      return base;
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.get('/food/recipes/:id/cost', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const summary = await computeRecipeCost(id);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.delete('/food/recipes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const usage = await prisma.foodRecipeItem.count({ where: { childRecipeId: id } });
    if (usage > 0) {
      return res.status(400).json({ error: 'Esta receta se usa como sub-receta en otros menús. Retírala primero de esas recetas.' });
    }

    await prisma.$transaction(async tx => {
      await tx.foodMealPlanEntry.deleteMany({ where: { recipeId: id } });
      await tx.foodRecipeItem.deleteMany({ where: { recipeId: id } });
      await tx.foodRecipeCost.deleteMany({ where: { recipeId: id } });
      await tx.foodRecipe.delete({ where: { id } });
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/food/cost-pools', async (_req, res, next) => {
  try {
    const pools = await prisma.foodCostPool.findMany({
      orderBy: [{ appliesTo: 'asc' }, { name: 'asc' }],
    });
    res.json({ items: pools });
  } catch (error) {
    next(error);
  }
});

router.post('/food/cost-pools', async (req, res, next) => {
  try {
    const parsed = CostPoolInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const pool = await prisma.foodCostPool.create({
      data: {
        name: parsed.data.name.trim(),
        type: parsed.data.type ?? 'OTROS',
        amount: parsed.data.amount,
        period: parsed.data.period,
        periodRations: parsed.data.periodRations ?? null,
        appliesTo: parsed.data.appliesTo ?? null,
        notes: parsed.data.notes ?? null,
        allocationMethod: parsed.data.allocationMethod ?? 'RACIONES',
        dailyBlocks: parsed.data.dailyBlocks ?? null,
        timeMinutes: parsed.data.timeMinutes ?? null,
      },
    });

    res.status(201).json(pool);
  } catch (error) {
    next(error);
  }
});

router.patch('/food/cost-pools/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const parsed = CostPoolInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const pool = await prisma.foodCostPool.update({
      where: { id },
      data: {
        name: parsed.data.name?.trim(),
        type: parsed.data.type,
        amount: parsed.data.amount,
        period: parsed.data.period,
        periodRations: parsed.data.periodRations ?? null,
        appliesTo: parsed.data.appliesTo ?? null,
        notes: parsed.data.notes ?? null,
        allocationMethod: parsed.data.allocationMethod ?? undefined,
        dailyBlocks: parsed.data.dailyBlocks ?? undefined,
        timeMinutes: parsed.data.timeMinutes ?? undefined,
      },
    });

    res.json(pool);
  } catch (error) {
    next(error);
  }
});

router.delete('/food/cost-pools/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    await prisma.foodCostPool.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/food/meal-plans', async (_req, res, next) => {
  try {
    const plans = await prisma.foodMealPlan.findMany({
      orderBy: [{ weekStart: 'desc' }, { createdAt: 'desc' }],
      include: {
        entries: { select: { servings: true } },
      },
      take: 24,
    });

    const items = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      weekStart: plan.weekStart,
      notes: plan.notes,
      totalEntries: plan.entries.length,
      totalServings: plan.entries.reduce((acc, entry) => acc + Number(entry.servings ?? 0), 0),
    }));

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/food/meal-plans', async (req, res, next) => {
  try {
    const parsed = MealPlanInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }

    const weekStart = parseDate(parsed.data.weekStart) ?? null;
    const plan = await prisma.foodMealPlan.create({
      data: {
        name: parsed.data.name.trim(),
        weekStart,
        notes: parsed.data.notes ?? null,
        entries: {
          create: parsed.data.entries.map(entry => ({
            dayIndex: entry.dayIndex,
            mealType: entry.mealType,
            recipeId: entry.recipeId,
            servings: entry.servings,
            notes: entry.notes ?? null,
          })),
        },
      },
      include: {
        entries: {
          include: { recipe: { select: { name: true } } },
          orderBy: [{ dayIndex: 'asc' }, { mealType: 'asc' }],
        },
      },
    });

    res.status(201).json(mapMealPlanDetail(plan));
  } catch (error) {
    next(error);
  }
});

router.get('/food/meal-plans/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const plan = await prisma.foodMealPlan.findUnique({
      where: { id },
      include: {
        entries: {
          include: { recipe: { select: { name: true } } },
          orderBy: [{ dayIndex: 'asc' }, { mealType: 'asc' }],
        },
      },
    });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json(mapMealPlanDetail(plan));
  } catch (error) {
    next(error);
  }
});

router.put('/food/meal-plans/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const parsed = MealPlanInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validación', detail: parsed.error.flatten() });
    }
    const updated = await prisma.$transaction(async tx => {
      const base = await tx.foodMealPlan.update({
        where: { id },
        data: {
          name: parsed.data.name.trim(),
          weekStart: parseDate(parsed.data.weekStart) ?? null,
          notes: parsed.data.notes ?? null,
        },
      });
      await tx.foodMealPlanEntry.deleteMany({ where: { planId: id } });
      await tx.foodMealPlanEntry.createMany({
        data: parsed.data.entries.map(entry => ({
          planId: id,
          dayIndex: entry.dayIndex,
          mealType: entry.mealType,
          recipeId: entry.recipeId,
          servings: entry.servings,
          notes: entry.notes ?? null,
        })),
      });
      return base;
    });

    const detail = await prisma.foodMealPlan.findUnique({
      where: { id: updated.id },
      include: {
        entries: {
          include: { recipe: { select: { name: true } } },
          orderBy: [{ dayIndex: 'asc' }, { mealType: 'asc' }],
        },
      },
    });
    if (!detail) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json(mapMealPlanDetail(detail));
  } catch (error) {
    next(error);
  }
});

router.delete('/food/meal-plans/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    await prisma.foodMealPlan.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/food/meal-plans/:id/duplicate', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const source = await prisma.foodMealPlan.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!source) return res.status(404).json({ error: 'Plan no encontrado' });

    const name = req.body?.name?.trim() || `${source.name} (copia)`;
    const weekStart = parseDate(req.body?.weekStart) ?? source.weekStart ?? null;
    const copy = await prisma.foodMealPlan.create({
      data: {
        name,
        weekStart,
        notes: source.notes,
        entries: {
          create: source.entries.map(entry => ({
            dayIndex: entry.dayIndex,
            mealType: entry.mealType,
            recipeId: entry.recipeId,
            servings: entry.servings,
            notes: entry.notes,
          })),
        },
      },
      include: {
        entries: {
          include: { recipe: { select: { name: true } } },
          orderBy: [{ dayIndex: 'asc' }, { mealType: 'asc' }],
        },
      },
    });

    res.status(201).json(mapMealPlanDetail(copy));
  } catch (error) {
    next(error);
  }
});

router.get('/food/meal-plans/:id/summary', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const summary = await computeMealPlanSummary(id);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

export default router;
