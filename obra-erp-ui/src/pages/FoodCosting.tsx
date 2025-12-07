import { useEffect, useMemo, useState } from 'react';
import { foodApi } from '../lib/api';
import type {
  FoodCostLineType,
  FoodCostPool,
  FoodCostPoolType,
  FoodCostPeriod,
  FoodIngredientListItem,
  PoolAllocationMethod,
  FoodMealPlanDetail,
  FoodMealPlanListItem,
  FoodMealPlanSummary,
  FoodMealType,
  FoodRecipeDetail,
  FoodRecipeListItem,
  RecipeCostSummary,
} from '../lib/types';

type TabKey = 'recipes' | 'ingredients' | 'pools' | 'planner';

type IngredientFormState = {
  id: number | null;
  name: string;
  category: string;
  unit: string;
  mermaPct: string;
  notes: string;
};

type PriceFormState = {
  ingredientId: string;
  unitCost: string;
  effectiveDate: string;
  source: string;
  ingredientName: string;
};

type PoolFormState = {
  id: number | null;
  name: string;
  type: FoodCostPoolType;
  amount: string;
  baseAmount: string;
  usageMinutes: string;
  totalMinutes: string;
  period: FoodCostPeriod;
  periodRations: string;
  appliesTo: FoodMealType | '';
  allocationMethod: PoolAllocationMethod;
  dailyBlocks: string;
  timeMinutes: string;
  notes: string;
};

type RecipeItemForm = {
  key: string;
  mode: 'ingredient' | 'recipe';
  ingredientId: string;
  ingredientName: string;
  childRecipeId: string;
  quantity: string;
  unit: string;
  notes: string;
};

type RecipeItemPayloadInput = {
  ingredientId?: number;
  childRecipeId?: number;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
};

type ExtraCostForm = {
  key: string;
  label: string;
  amount: string;
  costType: FoodCostLineType;
  period: FoodCostPeriod;
  periodRations: string;
  notes: string;
};

type RecipeFormState = {
  id: number | null;
  name: string;
  mealType: FoodMealType;
  yield: string;
  yieldUnit: string;
  notes: string;
  items: RecipeItemForm[];
  extras: ExtraCostForm[];
  prepMinutes: string;
  dailyBlocks: string;
};

type SavingState = {
  ingredient: boolean;
  price: boolean;
  pool: boolean;
  recipe: boolean;
  mealPlan: boolean;
};

type PlannerEntryState = Record<string, { recipeId: string; servings: string }>;

type MealPlanFormState = {
  id: number | null;
  name: string;
  weekStart: string;
  notes: string;
  entries: PlannerEntryState;
};

const CURRENCY_FORMAT = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
});

const MEAL_LABELS: Record<FoodMealType, string> = {
  DESAYUNO: 'Desayuno',
  ALMUERZO: 'Almuerzo',
  CENA: 'Cena',
  REFRIGERIO: 'Refrigerio',
  COMPONENTE: 'Receta base',
};

const PRIMARY_MEALS: FoodMealType[] = ['DESAYUNO', 'ALMUERZO', 'CENA'];

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const PERIOD_LABELS: Record<FoodCostPeriod, string> = {
  POR_RACION: 'Por ración',
  POR_SERVICIO: 'Por servicio',
  DIARIO: 'Diario',
  SEMANAL: 'Semanal',
  MENSUAL: 'Mensual',
};

const POOL_LABELS: Record<FoodCostPoolType, string> = {
  MANO_OBRA: 'Mano de obra',
  ALQUILER: 'Alquiler',
  SERVICIOS_BASICOS: 'Servicios básicos',
  LOGISTICA: 'Logística',
  TRANSPORTE: 'Transporte',
  COMBUSTIBLE: 'Combustible',
  SUMINISTROS: 'Suministros',
  OTROS: 'Otros',
};

const EXTRA_LABELS: Record<FoodCostLineType, string> = {
  MANO_OBRA: 'Mano de obra directa',
  INDIRECTO: 'Gasto indirecto',
  TRANSPORTE: 'Transporte',
  LOGISTICA: 'Logística',
  SUMINISTROS: 'Suministros',
  OTROS: 'Otros',
};

const randomKey = () => Math.random().toString(36).slice(2, 10);

const INGREDIENT_CATEGORIES = [
  'Hortalizas',
  'Verduras',
  'Frutas',
  'Tubérculos',
  'Legumbres',
  'Cereales / Abarrotes',
  'Cárnicos',
  'Embutidos',
  'Lácteos',
  'Condimentos',
  'Aceites y grasas',
  'Bebidas',
  'Otros',
];

const emptyIngredientForm = (): IngredientFormState => ({
  id: null,
  name: '',
  category: '',
  unit: 'kg',
  mermaPct: '0',
  notes: '',
});

const defaultPlannerEntries = (): PlannerEntryState => {
  const entries: PlannerEntryState = {};
  DAY_LABELS.forEach((_, dayIndex) => {
    PRIMARY_MEALS.forEach(meal => {
      entries[`${dayIndex}-${meal}`] = { recipeId: '', servings: '' };
    });
  });
  return entries;
};

const emptyMealPlanForm = (): MealPlanFormState => ({
  id: null,
  name: 'Menú semanal',
  weekStart: new Date().toISOString().slice(0, 10),
  notes: '',
  entries: defaultPlannerEntries(),
});

const emptyPriceForm = (): PriceFormState => ({
  ingredientId: '',
  unitCost: '',
  effectiveDate: '',
  source: '',
  ingredientName: '',
});

const emptyPoolForm = (): PoolFormState => ({
  id: null,
  name: '',
  type: 'MANO_OBRA',
  amount: '',
  baseAmount: '',
  usageMinutes: '',
  totalMinutes: '',
  period: 'MENSUAL',
  periodRations: '',
  appliesTo: '',
  allocationMethod: 'RACIONES',
  dailyBlocks: '',
  timeMinutes: '',
  notes: '',
});

const DEFAULT_UNITS = [
  'kg',
  'g',
  'tm',
  'lb',
  'oz',
  'litro',
  'ml',
  'galón',
  'taza',
  'cucharada',
  'cucharadita',
  'unidad',
  'lata',
  'paquete',
  'porción',
  'pieza',
  'bolsa',
];

const blankItem = (mode: 'ingredient' | 'recipe' = 'ingredient'): RecipeItemForm => ({
  key: `item-${randomKey()}`,
  mode,
  ingredientId: '',
  ingredientName: '',
  childRecipeId: '',
  quantity: '1',
  unit: '',
  notes: '',
});

const blankExtra = (): ExtraCostForm => ({
  key: `extra-${randomKey()}`,
  label: '',
  amount: '',
  costType: 'MANO_OBRA',
  period: 'POR_RACION',
  periodRations: '',
  notes: '',
});

const emptyRecipeForm = (): RecipeFormState => ({
  id: null,
  name: '',
  mealType: 'ALMUERZO',
  yield: '20',
  yieldUnit: 'raciones',
  notes: '',
  items: [blankItem()],
  extras: [],
  prepMinutes: '60',
  dailyBlocks: '1',
});

const formatMoney = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'S/ 0.00';
  return CURRENCY_FORMAT.format(value);
};

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '0%';
  return `${(value * 100).toFixed(1)}%`;
};

const parseNumber = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, '')
    .toLowerCase()
    .trim();

export default function FoodCostingPage() {
  const [tab, setTab] = useState<TabKey>('recipes');
  const [ingredients, setIngredients] = useState<FoodIngredientListItem[]>([]);
  const [recipes, setRecipes] = useState<FoodRecipeListItem[]>([]);
  const [pools, setPools] = useState<FoodCostPool[]>([]);
  const [mealPlans, setMealPlans] = useState<FoodMealPlanListItem[]>([]);

  const [ingredientForm, setIngredientForm] = useState<IngredientFormState>(emptyIngredientForm());
  const [priceForm, setPriceForm] = useState<PriceFormState>(emptyPriceForm);
  const [poolForm, setPoolForm] = useState<PoolFormState>(emptyPoolForm());
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>(emptyRecipeForm());
  const [mealPlanForm, setMealPlanForm] = useState<MealPlanFormState>(emptyMealPlanForm());
  const [showIngredientForm, setShowIngredientForm] = useState(true);

  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [recipeCost, setRecipeCost] = useState<RecipeCostSummary | null>(null);
  const [selectedMealPlanId, setSelectedMealPlanId] = useState<number | null>(null);
  const [mealPlanSummary, setMealPlanSummary] = useState<FoodMealPlanSummary | null>(null);

  const [loading, setLoading] = useState({ ingredients: false, recipes: false, pools: false, mealPlans: false, mealPlanSummary: false });
  const [saving, setSaving] = useState<SavingState>({
    ingredient: false,
    price: false,
    pool: false,
    recipe: false,
    mealPlan: false,
  });
  const [messages, setMessages] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subRecipeOptions = useMemo(
    () =>
      recipes.map(recipe => ({
        value: recipe.id,
        label: `${recipe.name} · ${MEAL_LABELS[recipe.mealType]}`,
      })),
    [recipes],
  );

  const mealOptions = useMemo(
    () =>
      (Object.keys(MEAL_LABELS) as FoodMealType[]).map(value => ({
        value,
        label: MEAL_LABELS[value],
      })),
    [],
  );

  const unitOptions = useMemo(() => {
    const set = new Set(DEFAULT_UNITS);
    ingredients.forEach(item => {
      if (item.unit) set.add(item.unit);
    });
    recipeForm.items.forEach(item => {
      if (item.unit) set.add(item.unit);
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [ingredients, recipeForm.items]);

  useEffect(() => {
    void loadIngredients();
    void loadRecipes();
    void loadPools();
    void loadMealPlans();
  }, []);

  useEffect(() => {
    if (selectedMealPlanId) {
      void loadMealPlanSummaryData(selectedMealPlanId);
    } else {
      setMealPlanSummary(null);
    }
  }, [selectedMealPlanId]);

  const loadIngredients = async () => {
    setLoading(prev => ({ ...prev, ingredients: true }));
    setError(null);
    try {
      const res = await foodApi.ingredients.list();
      setIngredients(res.items);
      if (priceForm.ingredientId) {
        const exists = res.items.find(item => item.id === Number(priceForm.ingredientId));
        if (!exists) {
          setPriceForm(emptyPriceForm());
        }
      }
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(prev => ({ ...prev, ingredients: false }));
    }
  };

  const loadRecipes = async () => {
    setLoading(prev => ({ ...prev, recipes: true }));
    setError(null);
    try {
      const res = await foodApi.recipes.list();
      setRecipes(res.items);
      if (selectedRecipeId) {
        const stillExists = res.items.some(item => item.id === selectedRecipeId);
        if (!stillExists) {
          setSelectedRecipeId(null);
          setRecipeCost(null);
        }
      }
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(prev => ({ ...prev, recipes: false }));
    }
  };

  const loadPools = async () => {
    setLoading(prev => ({ ...prev, pools: true }));
    setError(null);
    try {
      const res = await foodApi.pools.list();
      setPools(res.items);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(prev => ({ ...prev, pools: false }));
    }
  };

  const loadMealPlans = async () => {
    setLoading(prev => ({ ...prev, mealPlans: true }));
    setError(null);
    try {
      const res = await foodApi.mealPlans.list();
      setMealPlans(res.items);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(prev => ({ ...prev, mealPlans: false }));
    }
  };

  const applyMealPlanDetail = (detail: FoodMealPlanDetail) => {
    const entries = defaultPlannerEntries();
    detail.entries.forEach(entry => {
      const key = `${entry.dayIndex}-${entry.mealType}`;
      entries[key] = {
        recipeId: String(entry.recipeId),
        servings: entry.servings ? String(entry.servings) : '',
      };
    });
    setMealPlanForm({
      id: detail.id,
      name: detail.name,
      weekStart: detail.weekStart ? detail.weekStart.slice(0, 10) : '',
      notes: detail.notes ?? '',
      entries,
    });
    setSelectedMealPlanId(detail.id);
  };

  const handleSelectMealPlan = async (planId: number) => {
    setLoading(prev => ({ ...prev, mealPlans: true }));
    setError(null);
    try {
      const detail = await foodApi.mealPlans.get(planId);
      applyMealPlanDetail(detail);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(prev => ({ ...prev, mealPlans: false }));
    }
  };

  const collectMealPlanEntries = () => {
    const list: Array<{ dayIndex: number; mealType: FoodMealType; recipeId: number; servings: number }> = [];
    Object.entries(mealPlanForm.entries).forEach(([key, value]) => {
      if (!value.recipeId || !value.servings) return;
      const servings = parseNumber(value.servings);
      if (!servings) return;
      const [dayIndexStr, mealType] = key.split('-');
      list.push({
        dayIndex: Number(dayIndexStr),
        mealType: mealType as FoodMealType,
        recipeId: Number(value.recipeId),
        servings,
      });
    });
    return list;
  };

  const handleMealPlanSave = async () => {
    const entries = collectMealPlanEntries();
    if (!entries.length) {
      setError('Agrega al menos una comida con raciones.');
      return;
    }
    setSaving(prev => ({ ...prev, mealPlan: true }));
    setError(null);
    try {
      const payload = {
        name: mealPlanForm.name.trim() || 'Menú semanal',
        weekStart: mealPlanForm.weekStart || null,
        notes: mealPlanForm.notes.trim() || null,
        entries,
      };
      let detail: FoodMealPlanDetail;
      if (mealPlanForm.id) {
        detail = await foodApi.mealPlans.update(mealPlanForm.id, payload);
      } else {
        detail = await foodApi.mealPlans.create(payload);
      }
      applyMealPlanDetail(detail);
      setMessages('Menú semanal guardado');
      await loadMealPlans();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, mealPlan: false }));
    }
  };

const handleMealPlanDelete = async (planId: number | null) => {
    if (!planId) return;
    if (!window.confirm('¿Eliminar el menú seleccionado?')) return;
    setSaving(prev => ({ ...prev, mealPlan: true }));
    setError(null);
    try {
      await foodApi.mealPlans.remove(planId);
      setMessages('Menú eliminado');
      await loadMealPlans();
      setMealPlanForm(emptyMealPlanForm());
      setSelectedMealPlanId(null);
      setMealPlanSummary(null);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, mealPlan: false }));
    }
  };

  const handleMealPlanNew = () => {
    setMealPlanForm(emptyMealPlanForm());
    setSelectedMealPlanId(null);
    setMealPlanSummary(null);
  };

  const handleMealPlanDuplicate = async (planId: number) => {
    setSaving(prev => ({ ...prev, mealPlan: true }));
    setError(null);
    try {
      const detail = await foodApi.mealPlans.duplicate(planId, {
        name: `${mealPlans.find(plan => plan.id === planId)?.name ?? 'Menú'} (copia)`,
      });
      applyMealPlanDetail(detail);
      setMessages('Menú duplicado');
      await loadMealPlans();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, mealPlan: false }));
    }
  };

  const loadMealPlanSummaryData = async (planId: number) => {
    setLoading(prev => ({ ...prev, mealPlanSummary: true }));
    setError(null);
    try {
      const summary = await foodApi.mealPlans.summary(planId);
      setMealPlanSummary(summary);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(prev => ({ ...prev, mealPlanSummary: false }));
    }
  };

  const exportMealPlanCsv = () => {
    if (!mealPlanSummary) return;
    const headers = ['Ingrediente', 'Cantidad', 'Unidad', 'Costo unitario', 'Subtotal'];
    const rows = mealPlanSummary.ingredients.map(item => [
      item.name,
      item.quantity.toFixed(4),
      item.unit ?? '',
      item.unitCost.toFixed(2),
      item.subtotal.toFixed(2),
    ]);
    const csv = [headers, ...rows]
      .map(line => line.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${mealPlanSummary.plan.name || 'plan'}-lista-insumos.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const normalizeError = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'Ocurrió un error inesperado.';
  };

  const findIngredientByName = (name: string) => {
    const normalized = normalizeText(name);
    if (!normalized) return undefined;
    return ingredients.find(item => normalizeText(item.name) === normalized);
  };

  const handleIngredientSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ingredientForm.name.trim()) return;
    setSaving(prev => ({ ...prev, ingredient: true }));
    setError(null);
    try {
      const payload = {
        name: ingredientForm.name.trim(),
        category: ingredientForm.category.trim() || null,
        unit: ingredientForm.unit.trim() || null,
        defaultWastePct: parseNumber(ingredientForm.mermaPct) / 100,
        notes: ingredientForm.notes.trim() || null,
      };
      if (ingredientForm.id) {
        await foodApi.ingredients.update(ingredientForm.id, payload);
        setMessages('Ingrediente actualizado');
      } else {
        await foodApi.ingredients.create(payload);
        setMessages('Ingrediente guardado');
      }
      setIngredientForm(emptyIngredientForm);
      await loadIngredients();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, ingredient: false }));
    }
  };

  const handlePriceSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!priceForm.ingredientId || !priceForm.unitCost) return;
    setSaving(prev => ({ ...prev, price: true }));
    setError(null);
    try {
      await foodApi.ingredients.addCost(Number(priceForm.ingredientId), {
        unitCost: parseNumber(priceForm.unitCost),
        effectiveDate: priceForm.effectiveDate || null,
        source: priceForm.source.trim() || null,
      });
      setMessages('Costo actualizado');
      setPriceForm(emptyPriceForm);
      await loadIngredients();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, price: false }));
    }
  };

  const handleImportWaste = async () => {
    setSaving(prev => ({ ...prev, ingredient: true }));
    setError(null);
    try {
      await foodApi.ingredients.importDefaults();
      await loadIngredients();
      setMessages('Tabla de mermas importada');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, ingredient: false }));
    }
  };

  const computePoolShare = (form: PoolFormState): number | null => {
    const base = parseNumber(form.baseAmount);
    const usage = parseNumber(form.usageMinutes);
    const total = parseNumber(form.totalMinutes);
    if (base > 0 && usage > 0 && total > 0 && usage <= total) {
      return (base * usage) / total;
    }
    return null;
  };

  const handlePoolSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!poolForm.name.trim()) return;
    setSaving(prev => ({ ...prev, pool: true }));
    setError(null);
    try {
      const autoShare = computePoolShare(poolForm);
      const finalAmount = autoShare !== null ? autoShare : parseNumber(poolForm.amount);
      if (!finalAmount) {
        setSaving(prev => ({ ...prev, pool: false }));
        setError('Ingresa el monto o completa los campos de proporción.');
        return;
      }
      const allocationMethod = poolForm.allocationMethod;
      let dailyBlocks = null;
      let timeMinutes = null;
      if (allocationMethod === 'BLOQUES') {
        dailyBlocks = poolForm.dailyBlocks ? parseNumber(poolForm.dailyBlocks) : null;
        if (!dailyBlocks) {
          setSaving(prev => ({ ...prev, pool: false }));
          setError('Ingresa el número de bloques diarios para prorratear.');
          return;
        }
      }
      if (allocationMethod === 'MINUTOS') {
        timeMinutes = poolForm.timeMinutes ? parseNumber(poolForm.timeMinutes) : null;
        if (!timeMinutes) {
          setSaving(prev => ({ ...prev, pool: false }));
          setError('Ingresa los minutos totales del periodo para prorratear.');
          return;
        }
      }

      const payload = {
        name: poolForm.name.trim(),
        type: poolForm.type,
        amount: finalAmount,
        period: poolForm.period,
        periodRations: poolForm.period === 'POR_RACION' ? null : (poolForm.periodRations ? parseNumber(poolForm.periodRations) : null),
        appliesTo: poolForm.appliesTo || null,
        allocationMethod,
        dailyBlocks,
        timeMinutes,
        notes: poolForm.notes.trim() || null,
      };
      if (poolForm.id) {
        await foodApi.pools.update(poolForm.id, payload);
        setMessages('Costo fijo actualizado');
      } else {
        await foodApi.pools.create(payload);
        setMessages('Costo fijo guardado');
      }
      setPoolForm(emptyPoolForm());
      await loadPools();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, pool: false }));
    }
  };

  const handlePoolEdit = (pool: FoodCostPool) => {
    setPoolForm({
      id: pool.id,
      name: pool.name,
      type: pool.type,
      amount: pool.amount.toString(),
      baseAmount: pool.amount.toString(),
      usageMinutes: '',
      totalMinutes: '',
      period: pool.period,
      periodRations: pool.periodRations ? pool.periodRations.toString() : '',
      appliesTo: pool.appliesTo ?? '',
      allocationMethod: pool.allocationMethod ?? 'RACIONES',
      dailyBlocks: pool.dailyBlocks ? pool.dailyBlocks.toString() : '',
      timeMinutes: pool.timeMinutes ? pool.timeMinutes.toString() : '',
      notes: pool.notes ?? '',
    });
    setTab('pools');
  };

  const handlePoolDelete = async (pool: FoodCostPool) => {
    if (!window.confirm(`¿Eliminar ${pool.name}?`)) return;
    try {
      await foodApi.pools.remove(pool.id);
      await loadPools();
      setMessages('Costo fijo eliminado');
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const handleRecipeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recipeForm.name.trim()) return;
    setSaving(prev => ({ ...prev, recipe: true }));
    setError(null);
    try {
      const createdMap = new Map<string, number>();
      const itemsPayload: RecipeItemPayloadInput[] = [];

      const ensureIngredientId = async (rawName: string): Promise<number | null> => {
        const normalized = normalizeText(rawName);
        if (!normalized) return null;
        const cached = createdMap.get(normalized);
        if (cached) return cached;
        const existing = findIngredientByName(rawName);
        if (existing) return existing.id;
        const created = await foodApi.ingredients.create({ name: rawName });
        createdMap.set(normalized, created.id);
        setIngredients(prev => {
          const already = prev.some(item => item.id === created.id);
          return already ? prev : [...prev, created];
        });
        return created.id;
      };

      for (const item of recipeForm.items) {
        const quantity = parseNumber(item.quantity);
        if (!quantity) continue;
        if (item.mode === 'ingredient') {
          let ingredientId = item.ingredientId ? Number(item.ingredientId) : undefined;
          if (!ingredientId && item.ingredientName.trim()) {
            ingredientId = await ensureIngredientId(item.ingredientName.trim()) ?? undefined;
          }
          if (!ingredientId) continue;
          itemsPayload.push({
            ingredientId,
            quantity,
            unit: item.unit.trim() || null,
            notes: item.notes.trim() || null,
          });
        } else {
          if (!item.childRecipeId) continue;
          itemsPayload.push({
            childRecipeId: Number(item.childRecipeId),
            quantity,
            unit: item.unit.trim() || null,
            notes: item.notes.trim() || null,
          });
        }
      }

      if (!itemsPayload.length) {
        setError('Agrega al menos un ingrediente o sub-receta.');
        return;
      }

      const payload = {
        name: recipeForm.name.trim(),
        code: null,
        mealType: recipeForm.mealType,
        yield: Math.max(1, parseNumber(recipeForm.yield)),
        yieldUnit: recipeForm.yieldUnit.trim() || null,
        notes: recipeForm.notes.trim() || null,
        items: itemsPayload,
        extraCosts: recipeForm.extras
          .filter(extra => extra.label.trim() && extra.amount)
          .map(extra => ({
            label: extra.label.trim(),
            amount: parseNumber(extra.amount),
            costType: extra.costType,
            period: extra.period,
            periodRations: extra.period === 'POR_RACION' ? null : (extra.periodRations ? parseNumber(extra.periodRations) : null),
            notes: extra.notes?.trim() || null,
          })),
        prepMinutes: recipeForm.prepMinutes ? parseNumber(recipeForm.prepMinutes) : 0,
        dailyBlocks: recipeForm.dailyBlocks ? Math.max(1, parseNumber(recipeForm.dailyBlocks)) : 1,
      };

      let saved: FoodRecipeDetail;
      if (recipeForm.id) {
        saved = await foodApi.recipes.update(recipeForm.id, payload);
        setMessages('Receta actualizada');
      } else {
        saved = await foodApi.recipes.create(payload);
        setMessages('Receta guardada');
      }
      await loadRecipes();
      await handleSelectRecipe(saved.id);
      setShowIngredientForm(false);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, recipe: false }));
    }
  };

  const handleDeleteRecipe = async () => {
    if (!selectedRecipeId) return;
    if (!window.confirm('¿Eliminar la receta seleccionada? Esta acción no se puede deshacer.')) return;
    setSaving(prev => ({ ...prev, recipe: true }));
    setError(null);
    try {
      await foodApi.recipes.remove(selectedRecipeId);
      setMessages('Receta eliminada');
      setRecipeForm(emptyRecipeForm());
      setRecipeCost(null);
      setSelectedRecipeId(null);
      await loadRecipes();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(prev => ({ ...prev, recipe: false }));
    }
  };

  const handleSelectRecipe = async (id: number) => {
    setSelectedRecipeId(id);
    setError(null);
    try {
      const detail = await foodApi.recipes.get(id);
      setRecipeForm({
        id: detail.id,
        name: detail.name,
        mealType: detail.mealType,
        yield: detail.yield.toString(),
        yieldUnit: detail.yieldUnit ?? 'raciones',
        notes: detail.notes ?? '',
        items: detail.items.length ? detail.items.map(item => ({
          key: `item-${item.id}`,
          mode: item.ingredientId ? 'ingredient' : 'recipe',
          ingredientId: item.ingredientId ? String(item.ingredientId) : '',
          ingredientName: item.ingredient?.name ?? '',
          childRecipeId: item.childRecipeId ? String(item.childRecipeId) : '',
          quantity: item.quantity.toString(),
          unit: item.unit ?? '',
          notes: item.notes ?? '',
        })) : [blankItem()],
        extras: detail.extraCosts.map(extra => ({
          key: `extra-${extra.id}`,
          label: extra.label,
          amount: extra.amount.toString(),
          costType: extra.costType,
          period: extra.period,
          periodRations: extra.periodRations ? extra.periodRations.toString() : '',
          notes: extra.notes ?? '',
        })),
        prepMinutes: detail.prepMinutes ? detail.prepMinutes.toString() : '0',
        dailyBlocks: detail.dailyBlocks ? detail.dailyBlocks.toString() : '1',
      });
      const summary = await foodApi.recipes.cost(id);
      setRecipeCost(summary);
      setShowIngredientForm(false);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const handleNewRecipe = () => {
    setRecipeForm(emptyRecipeForm());
    setSelectedRecipeId(null);
    setRecipeCost(null);
    setShowIngredientForm(true);
  };

  const syncRecipeCost = async () => {
    if (!selectedRecipeId) return;
    try {
      const summary = await foodApi.recipes.cost(selectedRecipeId);
      setRecipeCost(summary);
      setMessages('Costos recalculados');
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const renderTabs = () => (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setTab('recipes')}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === 'recipes' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
      >
        Menús
      </button>
      <button
        type="button"
        onClick={() => setTab('ingredients')}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === 'ingredients' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
      >
        Ingredientes
      </button>
      <button
        type="button"
        onClick={() => setTab('pools')}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === 'pools' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
      >
        Costos fijos
      </button>
      <button
        type="button"
        onClick={() => setTab('planner')}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === 'planner' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
      >
        Planificador semanal
      </button>
    </div>
  );

  const renderMessages = () =>
    (messages || error) && (
      <div className={`mb-4 rounded-md px-4 py-2 text-sm ${error ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
        {error ?? messages}
        <button type="button" className="ml-3 text-xs underline" onClick={() => { setError(null); setMessages(null); }}>
          cerrar
        </button>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Costeo de alimentación</h2>
        <p className="text-sm text-slate-500">Define tus ingredientes, menús y gastos fijos para conocer el costo real por persona.</p>
      </div>
      {renderTabs()}
      {renderMessages()}
      {tab === 'ingredients' && (
        <IngredientsTab
          list={ingredients}
          loading={loading.ingredients}
          form={ingredientForm}
          setForm={setIngredientForm}
          priceForm={priceForm}
          setPriceForm={setPriceForm}
          onSubmit={handleIngredientSubmit}
          onPriceSubmit={handlePriceSubmit}
          onImport={handleImportWaste}
          unitOptions={unitOptions}
          saving={saving}
        />
      )}
      {tab === 'pools' && (
        <PoolsTab
          pools={pools}
          form={poolForm}
          setForm={setPoolForm}
          onSubmit={handlePoolSubmit}
          onComputeShare={computePoolShare}
          onEdit={handlePoolEdit}
          onDelete={handlePoolDelete}
          mealOptions={mealOptions}
          saving={saving.pool}
        />
      )}
      {tab === 'recipes' && (
        <RecipesTab
          recipes={recipes}
          ingredientCatalog={ingredients}
          subRecipes={subRecipeOptions}
          unitOptions={unitOptions}
          recipeForm={recipeForm}
          setRecipeForm={setRecipeForm}
          onSubmit={handleRecipeSubmit}
          selectedRecipeId={selectedRecipeId}
          onSelect={handleSelectRecipe}
          onCreateNew={handleNewRecipe}
          recipeCost={recipeCost}
          onRefreshCost={syncRecipeCost}
          onDelete={handleDeleteRecipe}
          saving={saving.recipe}
          loadingList={loading.recipes}
          ingredientFormVisible={showIngredientForm}
          onToggleIngredientForm={() => setShowIngredientForm(prev => !prev)}
        />
      )}
      {tab === 'planner' && (
        <MealPlannerTab
          recipes={recipes}
          mealPlans={mealPlans}
          form={mealPlanForm}
          setForm={setMealPlanForm}
          selectedPlanId={selectedMealPlanId}
          onSelectPlan={handleSelectMealPlan}
          onNewPlan={handleMealPlanNew}
          onSavePlan={handleMealPlanSave}
          onDeletePlan={handleMealPlanDelete}
          onDuplicatePlan={handleMealPlanDuplicate}
          loadingList={loading.mealPlans}
          loadingSummary={loading.mealPlanSummary}
          saving={saving.mealPlan}
          summary={mealPlanSummary}
          onExportCsv={exportMealPlanCsv}
        />
      )}
    </div>
  );
}

type IngredientsTabProps = {
  list: FoodIngredientListItem[];
  loading: boolean;
  form: IngredientFormState;
  setForm: (form: IngredientFormState) => void;
  priceForm: PriceFormState;
  setPriceForm: (form: PriceFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onPriceSubmit: (event: React.FormEvent) => void;
  onImport: () => void;
  unitOptions: string[];
  saving: SavingState;
};

function IngredientsTab({
  list,
  loading,
  form,
  setForm,
  priceForm,
  setPriceForm,
  onSubmit,
  onPriceSubmit,
  onImport,
  unitOptions,
  saving,
}: IngredientsTabProps) {
  const selectForEdit = (item: FoodIngredientListItem) => {
    setForm({
      id: item.id,
      name: item.name,
      category: item.category ?? '',
      unit: item.unit ?? '',
      mermaPct: ((item.defaultWastePct ?? 0) * 100).toFixed(1),
      notes: item.notes ?? '',
    });
    setPriceForm({
      ...priceForm,
      ingredientId: String(item.id),
      ingredientName: item.name,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Catálogo de ingredientes</h3>
          <button
            type="button"
            onClick={onImport}
            className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Importar tabla de mermas
          </button>
        </div>
        <div className="max-h-[480px] overflow-auto border border-slate-100">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Ingrediente</th>
                <th className="px-3 py-2">Merma</th>
                <th className="px-3 py-2">Último costo</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-slate-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && list.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-slate-500">
                    Aún no tienes ingredientes registrados.
                  </td>
                </tr>
              )}
              {!loading &&
                list.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{item.name}</div>
                      <div className="text-xs text-slate-500">{item.unit ?? 'sin unidad'}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">{formatPercent(item.defaultWastePct ?? 0)}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {item.latestCost ? formatMoney(Number(item.latestCost)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => selectForEdit(item)}
                        className="text-blue-600 hover:text-blue-500"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-6">
        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold">{form.id ? 'Editar ingrediente' : 'Nuevo ingrediente'}</h3>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Nombre
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Categoría
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Seleccionar…</option>
                  {INGREDIENT_CATEGORIES.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Unidad
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  list="ingredient-unit-options"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  placeholder="kg, litro, unidad…"
                />
                <datalist id="ingredient-unit-options">
                  {unitOptions.map(option => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Merma (%)
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={95}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.mermaPct}
                  onChange={e => setForm({ ...form, mermaPct: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Notas
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
                disabled={saving.ingredient}
              >
                {saving.ingredient ? 'Guardando…' : 'Guardar'}
              </button>
              {form.id && (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-4 py-2 text-slate-600"
                  onClick={() => setForm(emptyIngredientForm())}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </form>

        <form onSubmit={onPriceSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold">Actualizar precio</h3>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Ingrediente
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={priceForm.ingredientId}
                onChange={e => {
                  const ingredient = list.find(item => item.id === Number(e.target.value));
                  setPriceForm({
                    ...priceForm,
                    ingredientId: e.target.value,
                    ingredientName: ingredient?.name ?? '',
                  });
                }}
                required
              >
                <option value="">Selecciona uno…</option>
                {list.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {priceForm.ingredientName && (
              <p className="text-xs text-slate-500">
                Editando: <span className="font-semibold">{priceForm.ingredientName}</span>
              </p>
            )}
            <label className="block text-sm font-medium text-slate-700">
              Precio unitario (S/)
              <input
                type="number"
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={priceForm.unitCost}
                onChange={e => setPriceForm({ ...priceForm, unitCost: e.target.value })}
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Fecha
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={priceForm.effectiveDate}
                  onChange={e => setPriceForm({ ...priceForm, effectiveDate: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Fuente / proveedor
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={priceForm.source}
                  onChange={e => setPriceForm({ ...priceForm, source: e.target.value })}
                />
              </label>
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
              disabled={saving.price}
            >
              {saving.price ? 'Guardando…' : 'Registrar precio'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type PoolsTabProps = {
  pools: FoodCostPool[];
  form: PoolFormState;
  setForm: (form: PoolFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onComputeShare: (form: PoolFormState) => number | null;
  onEdit: (pool: FoodCostPool) => void;
  onDelete: (pool: FoodCostPool) => void;
  mealOptions: { value: FoodMealType; label: string }[];
  saving: boolean;
};

function PoolsTab({ pools, form, setForm, onSubmit, onComputeShare, onEdit, onDelete, mealOptions, saving }: PoolsTabProps) {
  const autoShare = onComputeShare(form);

  const handleFieldChange = (updates: Partial<PoolFormState>) => {
    const next = { ...form, ...updates };
    const share = onComputeShare(next);
    if (share !== null) {
      next.amount = share.toFixed(2);
    }
    setForm(next);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold">Gastos fijos y prorrateos</h3>
        <div className="max-h-[520px] overflow-auto border border-slate-100">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pools.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-slate-500">
                    Aún no registras gastos fijos.
                  </td>
                </tr>
              )}
              {pools.map(pool => (
                <tr key={pool.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{pool.name}</div>
                    <div className="text-xs text-slate-500">{POOL_LABELS[pool.type]}</div>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {formatMoney(pool.amount)} · {PERIOD_LABELS[pool.period]}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{pool.appliesTo ? MEAL_LABELS[pool.appliesTo] : 'Todos'}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => onEdit(pool)} className="mr-2 text-blue-600 hover:text-blue-500">
                      Editar
                    </button>
                    <button type="button" onClick={() => onDelete(pool)} className="text-red-600 hover:text-red-500">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-semibold">{form.id ? 'Editar costo fijo' : 'Nuevo costo fijo'}</h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Concepto
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.name}
              onChange={e => handleFieldChange({ name: e.target.value })}
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Tipo
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.type}
                onChange={e => handleFieldChange({ type: e.target.value as FoodCostPoolType })}
              >
                {(Object.keys(POOL_LABELS) as FoodCostPoolType[]).map(value => (
                  <option key={value} value={value}>
                    {POOL_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Periodo
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.period}
                onChange={e => handleFieldChange({ period: e.target.value as FoodCostPeriod })}
              >
                {(Object.keys(PERIOD_LABELS) as FoodCostPeriod[]).map(value => (
                  <option key={value} value={value}>
                    {PERIOD_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Método de prorrateo
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.allocationMethod}
              onChange={e => handleFieldChange({ allocationMethod: e.target.value as PoolAllocationMethod })}
            >
              <option value="RACIONES">Por raciones</option>
              <option value="BLOQUES">Por bloques/turnos</option>
              <option value="MINUTOS">Por minutos reales</option>
            </select>
          </label>
          {form.allocationMethod === 'BLOQUES' && (
            <label className="block text-sm font-medium text-slate-700">
              Bloques diarios que cubre este costo
              <input
                type="number"
                min="1"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.dailyBlocks}
                onChange={e => handleFieldChange({ dailyBlocks: e.target.value })}
                placeholder="Ej. 3 bloques (desayuno, almuerzo, cena)"
              />
            </label>
          )}
          {form.allocationMethod === 'MINUTOS' && (
            <label className="block text-sm font-medium text-slate-700">
              Minutos totales del periodo
              <input
                type="number"
                min="1"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.timeMinutes}
                onChange={e => handleFieldChange({ timeMinutes: e.target.value })}
                placeholder="Ej. 240 minutos por turno"
              />
            </label>
          )}
          <div className="rounded-lg border border-dashed border-slate-300 p-3">
            <p className="text-sm font-semibold text-slate-700">Prorrateo automático</p>
            <p className="text-xs text-slate-500">Ingresa el monto total del vehículo y el tiempo usado para alimentación. El sistema calculará la parte correspondiente.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Monto total del periodo (S/)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={form.baseAmount}
                  onChange={e => handleFieldChange({ baseAmount: e.target.value })}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Minutos para alimentación
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={form.usageMinutes}
                  onChange={e => handleFieldChange({ usageMinutes: e.target.value })}
                  placeholder="Ej. 40"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Minutos totales del periodo
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={form.totalMinutes}
                  onChange={e => handleFieldChange({ totalMinutes: e.target.value })}
                  placeholder="Ej. 1200"
                />
              </label>
            </div>
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {autoShare !== null
                ? `Monto asignado a alimentación: S/ ${autoShare.toFixed(2)}`
                : 'Si dejas estos campos vacíos, puedes ingresar el monto manualmente.'}
            </div>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Monto en soles (manual o calculado)
            <input
              type="number"
              step="0.01"
              min="0"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.amount}
              onChange={e => handleFieldChange({ amount: e.target.value })}
              required
            />
          </label>
          {form.allocationMethod === 'RACIONES' && form.period !== 'POR_RACION' && (
            <label className="block text-sm font-medium text-slate-700">
              Raciones que cubre ese periodo
              <input
                type="number"
                step="1"
                min="1"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={form.periodRations}
                onChange={e => handleFieldChange({ periodRations: e.target.value })}
                placeholder="Ej: 4500 raciones/mes"
              />
            </label>
          )}
          <label className="block text-sm font-medium text-slate-700">
            ¿A qué servicio aplica?
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.appliesTo}
              onChange={e => handleFieldChange({ appliesTo: e.target.value as FoodMealType | '' })}
            >
              <option value="">Todos</option>
              {mealOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Notas
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.notes}
              onChange={e => handleFieldChange({ notes: e.target.value })}
            />
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            {form.id && (
              <button
                type="button"
                className="rounded-md border border-slate-300 px-4 py-2 text-slate-600"
                onClick={() => setForm(emptyPoolForm())}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

type RecipesTabProps = {
  recipes: FoodRecipeListItem[];
  ingredientCatalog: FoodIngredientListItem[];
  subRecipes: { value: number; label: string }[];
  unitOptions: string[];
  recipeForm: RecipeFormState;
  setRecipeForm: (form: RecipeFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  selectedRecipeId: number | null;
  onSelect: (id: number) => void;
  onCreateNew: () => void;
  recipeCost: RecipeCostSummary | null;
  onRefreshCost: () => void;
  onDelete: () => void;
  saving: boolean;
  loadingList: boolean;
  ingredientFormVisible: boolean;
  onToggleIngredientForm: () => void;
};

function RecipesTab({
  recipes,
  ingredientCatalog,
  subRecipes,
  unitOptions,
  recipeForm,
  setRecipeForm,
  onSubmit,
  selectedRecipeId,
  onSelect,
  onCreateNew,
  recipeCost,
  onRefreshCost,
  onDelete,
  saving,
  loadingList,
  ingredientFormVisible,
  onToggleIngredientForm,
}: RecipesTabProps) {
  const getIngredientById = (value?: string) => {
    if (!value) return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return ingredientCatalog.find(item => item.id === numeric);
  };

  const getIngredientByName = (name?: string) => {
    if (!name) return undefined;
    const normalized = normalizeText(name);
    if (!normalized) return undefined;
    return ingredientCatalog.find(item => normalizeText(item.name) === normalized);
  };

  const handleItemChange = (index: number, partial: Partial<RecipeItemForm>) => {
    const copy = [...recipeForm.items];
    copy[index] = { ...copy[index], ...partial };
    setRecipeForm({ ...recipeForm, items: copy });
  };

  const handleExtraChange = (index: number, partial: Partial<ExtraCostForm>) => {
    const copy = [...recipeForm.extras];
    copy[index] = { ...copy[index], ...partial };
    setRecipeForm({ ...recipeForm, extras: copy });
  };

  const addItem = (mode: 'ingredient' | 'recipe') => {
    setRecipeForm({ ...recipeForm, items: [blankItem(mode), ...recipeForm.items] });
  };

  const removeItem = (index: number) => {
    const copy = recipeForm.items.filter((_, idx) => idx !== index);
    setRecipeForm({ ...recipeForm, items: copy.length ? copy : [blankItem()] });
  };

  const addExtra = () => {
    setRecipeForm({ ...recipeForm, extras: [...recipeForm.extras, blankExtra()] });
  };

  const removeExtra = (index: number) => {
    const copy = recipeForm.extras.filter((_, idx) => idx !== index);
    setRecipeForm({ ...recipeForm, extras: copy });
  };

  const mealBadges: Record<FoodMealType, string> = {
    DESAYUNO: 'bg-yellow-100 text-yellow-800',
    ALMUERZO: 'bg-emerald-100 text-emerald-800',
    CENA: 'bg-indigo-100 text-indigo-800',
    REFRIGERIO: 'bg-orange-100 text-orange-800',
    COMPONENTE: 'bg-slate-200 text-slate-700',
  };

  return (
    <>
      <datalist id="recipe-unit-options">
        {unitOptions.map(option => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase text-slate-500">Recetas guardadas</h3>
          <button type="button" className="text-xs font-semibold text-blue-600" onClick={onCreateNew}>
            + Nuevo
          </button>
        </div>
        <div className="max-h-[520px] overflow-auto">
          {loadingList && <p className="px-2 py-3 text-sm text-slate-500">Cargando…</p>}
          {!loadingList && recipes.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">Aún no registras recetas.</p>}
          <ul className="space-y-2">
            {recipes.map(recipe => (
              <li key={recipe.id}>
                <button
                  type="button"
                  onClick={() => onSelect(recipe.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    selectedRecipeId === recipe.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{recipe.name}</p>
                    <span className={`rounded-full px-2 text-xs font-semibold ${mealBadges[recipe.mealType]}`}>{MEAL_LABELS[recipe.mealType]}</span>
                  </div>
                  <p className="text-xs text-slate-500">{recipe.yield} {recipe.yieldUnit ?? 'raciones'}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="space-y-6">
        <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{recipeForm.id ? 'Editar receta' : 'Nueva receta'}</h3>
            <button type="button" onClick={onCreateNew} className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600">
              Limpiar formulario
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Nombre
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={recipeForm.name}
                onChange={e => setRecipeForm({ ...recipeForm, name: e.target.value })}
                required
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Servicio
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={recipeForm.mealType}
                onChange={e => setRecipeForm({ ...recipeForm, mealType: e.target.value as FoodMealType })}
              >
                {(Object.keys(MEAL_LABELS) as FoodMealType[]).map(value => (
                  <option key={value} value={value}>
                    {MEAL_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Rinde
              <input
                type="number"
                min="1"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={recipeForm.yield}
                onChange={e => setRecipeForm({ ...recipeForm, yield: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Unidad de rinde
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={recipeForm.yieldUnit}
                onChange={e => setRecipeForm({ ...recipeForm, yieldUnit: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Minutos de preparación
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={recipeForm.prepMinutes}
                onChange={e => setRecipeForm({ ...recipeForm, prepMinutes: e.target.value })}
                placeholder="Ej. 60"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Bloques/turnos usados
              <input
                type="number"
                min="1"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                value={recipeForm.dailyBlocks}
                onChange={e => setRecipeForm({ ...recipeForm, dailyBlocks: e.target.value })}
                placeholder="Ej. 1"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Notas / instrucciones
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              rows={2}
              value={recipeForm.notes}
              onChange={e => setRecipeForm({ ...recipeForm, notes: e.target.value })}
            />
          </label>

          <div className="mt-5 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-600">Ingredientes y sub-recetas</p>
              <div className="space-x-2 text-sm">
                <button type="button" onClick={onToggleIngredientForm} className="rounded-full border border-slate-300 px-3 py-1">
                  {ingredientFormVisible ? 'Ocultar' : 'Editar'}
                </button>
                {ingredientFormVisible && (
                  <>
                    <button type="button" onClick={() => addItem('ingredient')} className="rounded-full border border-slate-300 px-3 py-1">
                      + Ingrediente
                    </button>
                    <button type="button" onClick={() => addItem('recipe')} className="rounded-full border border-slate-300 px-3 py-1">
                      + Sub-receta
                    </button>
                  </>
                )}
              </div>
            </div>
            {ingredientFormVisible ? (
              <div className="divide-y divide-slate-100">
                {recipeForm.items.map((item, index) => {
                  const datalistId = `ingredient-options-${index}`;
                  const selectedIngredient =
                    item.mode === 'ingredient'
                      ? getIngredientById(item.ingredientId) ?? getIngredientByName(item.ingredientName)
                      : undefined;
                  const mermaLabel = selectedIngredient ? formatPercent(selectedIngredient.defaultWastePct ?? 0) : '—';
                  return (
                    <div key={item.key} className="grid gap-3 p-3 md:grid-cols-5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tipo
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={item.mode}
                      onChange={e =>
                        handleItemChange(index, {
                          mode: e.target.value as 'ingredient' | 'recipe',
                          ingredientId: '',
                          ingredientName: '',
                          childRecipeId: '',
                        })
                      }
                    >
                      <option value="ingredient">Ingrediente</option>
                      <option value="recipe">Sub-receta</option>
                    </select>
                  </label>
                    <label className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {item.mode === 'ingredient' ? 'Ingrediente' : 'Sub-receta'}
                      {item.mode === 'ingredient' ? (
                        <>
                          <input
                            list={datalistId}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                            value={item.ingredientName}
                            placeholder="Escribe o selecciona..."
                            onChange={e => {
                              const value = e.target.value;
                              const match = getIngredientByName(value);
                              if (match) {
                                handleItemChange(index, { ingredientName: match.name, ingredientId: String(match.id) });
                              } else {
                                handleItemChange(index, { ingredientName: value, ingredientId: '' });
                              }
                            }}
                          />
                          <datalist id={datalistId}>
                            {ingredientCatalog.map(option => (
                              <option key={option.id} value={option.name} />
                            ))}
                          </datalist>
                          <p className="mt-1 text-xs text-slate-500">
                            Merma automática: <span className="font-semibold">{mermaLabel}</span>
                          </p>
                        </>
                      ) : (
                        <select
                          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                          value={item.childRecipeId}
                          onChange={e => handleItemChange(index, { childRecipeId: e.target.value })}
                        >
                          <option value="">Sub-receta…</option>
                          {subRecipes.map(option => (
                            <option key={option.value} value={option.value} disabled={option.value === recipeForm.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Cantidad
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={item.quantity}
                      onChange={e => handleItemChange(index, { quantity: e.target.value })}
                    />
                  </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Unidad / notas
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        list="recipe-unit-options"
                        value={item.unit}
                        onChange={e => handleItemChange(index, { unit: e.target.value })}
                        placeholder={item.mode === 'recipe' ? 'N° de tandas usadas' : 'kg, taza…'}
                      />
                    </label>
                  <label className="md:col-span-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Detalle / notas
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={item.notes}
                      onChange={e => handleItemChange(index, { notes: e.target.value })}
                    />
                  </label>
                    <div className="flex items-end justify-end">
                      <button type="button" className="text-xs text-red-500" onClick={() => removeItem(index)}>
                        Quitar
                      </button>
                    </div>
                  </div>
                );
                })}
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-600">
                <p className="mb-2 font-semibold">Lista de ingredientes ({recipeForm.items.length}):</p>
                <ul className="space-y-1">
                  {recipeForm.items.map(item => (
                    <li key={item.key}>
                      • {item.mode === 'ingredient' ? item.ingredientName || 'Ingrediente' : 'Sub-receta'} — {item.quantity}{' '}
                      {item.unit || ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-600">Costos extra (mano de obra, transporte, etc.)</p>
              <button type="button" onClick={addExtra} className="rounded-full border border-slate-300 px-3 py-1 text-sm">
                + Agregar costo
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {recipeForm.extras.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Opcional. Registra horas de cocina, combustible, empaques…</p>}
              {recipeForm.extras.map((extra, index) => (
                <div key={extra.key} className="grid gap-3 p-3 md:grid-cols-4">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Concepto
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={extra.label}
                      onChange={e => handleExtraChange(index, { label: e.target.value })}
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tipo
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={extra.costType}
                      onChange={e => handleExtraChange(index, { costType: e.target.value as FoodCostLineType })}
                    >
                      {(Object.keys(EXTRA_LABELS) as FoodCostLineType[]).map(value => (
                        <option key={value} value={value}>
                          {EXTRA_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Monto (S/)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={extra.amount}
                      onChange={e => handleExtraChange(index, { amount: e.target.value })}
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Periodo
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={extra.period}
                      onChange={e => handleExtraChange(index, { period: e.target.value as FoodCostPeriod })}
                    >
                      {(Object.keys(PERIOD_LABELS) as FoodCostPeriod[]).map(value => (
                        <option key={value} value={value}>
                          {PERIOD_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {extra.period !== 'POR_RACION' && (
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Raciones por periodo
                      <input
                        type="number"
                        min="1"
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        value={extra.periodRations}
                        onChange={e => handleExtraChange(index, { periodRations: e.target.value })}
                      />
                    </label>
                  )}
                  <label className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notas
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      value={extra.notes}
                      onChange={e => handleExtraChange(index, { notes: e.target.value })}
                    />
                  </label>
                  <div className="flex items-end justify-end">
                    <button type="button" className="text-xs text-red-500" onClick={() => removeExtra(index)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-3">
            {recipeForm.id && (
              <button
                type="button"
                className="rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                onClick={onDelete}
                disabled={saving}
              >
                Eliminar
              </button>
            )}
            <button type="submit" className="rounded-md bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-500" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>

        {recipeCost && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Costo calculado</h3>
                <p className="text-sm text-slate-500">
                  {recipeCost.recipe.yield} {recipeCost.recipe.yieldUnit ?? 'raciones'} ·{' '}
                  {MEAL_LABELS[recipeCost.recipe.mealType]}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshCost}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:border-slate-400"
              >
                Recalcular
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-xs uppercase tracking-wide text-blue-800">Costo por ración</p>
                <p className="text-3xl font-bold text-blue-900">{formatMoney(recipeCost.totals.perPortion)}</p>
                <p className="text-xs text-blue-700">Objetivo: S/ 24 diarios por persona</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Costo del servicio</p>
                <p className="text-3xl font-bold text-slate-900">{formatMoney(recipeCost.totals.batchTotal)}</p>
                <p className="text-xs text-slate-500">Incluye insumos, mermas y gastos fijos</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <BreakdownCard title="Insumos" amount={recipeCost.totals.ingredients} items={recipeCost.ingredients.map(item => ({
                label: item.name,
                value: formatMoney(item.grossCost),
                hint: `${item.quantity} ${item.unit ?? ''}`,
              }))} />
              <BreakdownCard
                title="Sub-recetas / Mano de obra / Fijos"
                amount={recipeCost.totals.components + recipeCost.totals.manualExtras + recipeCost.totals.pools}
                items={[
                  ...recipeCost.components.map(item => ({ label: item.name, value: formatMoney(item.batchCost), hint: `${item.quantity} tandas` })),
                  ...recipeCost.extras.map(item => ({ label: `${item.label} (${PERIOD_LABELS[item.period]})`, value: formatMoney(item.totalCost) })),
                  ...recipeCost.pools.map(item => ({ label: `${item.name} · ${POOL_LABELS[item.type]}`, value: formatMoney(item.totalCost) })),
                ]}
              />
            </div>
          </section>
        )}
      </section>
      </div>
    </>
  );
}

type BreakdownCardProps = {
  title: string;
  amount: number;
  items: Array<{ label: string; value: string; hint?: string }>;
};

function BreakdownCard({ title, amount, items }: BreakdownCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <p className="text-lg font-bold text-slate-900">{formatMoney(amount)}</p>
      </div>
      <ul className="space-y-1 text-sm text-slate-600">
        {items.length === 0 && <li className="text-slate-400">Sin registros</li>}
        {items.slice(0, 6).map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center justify-between">
            <span>
              {item.label}
              {item.hint && <span className="ml-2 text-xs text-slate-400">{item.hint}</span>}
            </span>
            <span className="font-semibold text-slate-800">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TimeDistributionEntry = {
  id: string;
  time: string;
  activity: string;
  responsible: string;
  notes: string;
};

const defaultTimeEntry = (): TimeDistributionEntry => ({
  id: randomKey(),
  time: '',
  activity: '',
  responsible: '',
  notes: '',
});

const initialTimeDistribution = (): TimeDistributionEntry[] => [
  { id: randomKey(), time: '06:00', activity: 'Desayuno listo en mesa', responsible: '', notes: '' },
  { id: randomKey(), time: '06:30', activity: 'Bus sale hacia la obra', responsible: '', notes: '' },
  { id: randomKey(), time: '07:20', activity: 'Personal en obra / pase de lista', responsible: '', notes: '' },
  { id: randomKey(), time: '07:25', activity: 'Charla de seguridad (10 minutos)', responsible: '', notes: '' },
  { id: randomKey(), time: '07:30', activity: 'Reparto de tareas del día', responsible: '', notes: '' },
  { id: randomKey(), time: '07:40', activity: 'Todos en su punto de trabajo', responsible: '', notes: '' },
  { id: randomKey(), time: '07:45', activity: 'Tanque de agua listo (2 bidones)', responsible: '', notes: '' },
  { id: randomKey(), time: '08:00', activity: 'Inicio de tareas operativas', responsible: '', notes: '' },
  { id: randomKey(), time: '10:00', activity: 'Revisión pendiente (apunte ilegible)', responsible: '', notes: 'Editar si aplica' },
  { id: randomKey(), time: '12:00', activity: 'Almuerzo', responsible: '', notes: '' },
  { id: randomKey(), time: '19:00', activity: 'Cena', responsible: '', notes: '' },
  { id: randomKey(), time: '20:00', activity: 'Pichanga (empresa cubre 2-3 veces por semana)', responsible: '', notes: '' },
  { id: randomKey(), time: '', activity: 'PA pendiente', responsible: '', notes: '' },
  { id: randomKey(), time: '', activity: 'Carga de materiales en camioneta (noche)', responsible: '', notes: '' },
  { id: randomKey(), time: '', activity: 'Combustible / abastecimiento', responsible: '', notes: '' },
];

type MealPlannerTabProps = {
  recipes: FoodRecipeListItem[];
  mealPlans: FoodMealPlanListItem[];
  form: MealPlanFormState;
  setForm: React.Dispatch<React.SetStateAction<MealPlanFormState>>;
  selectedPlanId: number | null;
  onSelectPlan: (id: number) => void;
  onNewPlan: () => void;
  onSavePlan: () => void;
  onDeletePlan: (id: number | null) => void;
  onDuplicatePlan: (id: number) => void;
  loadingList: boolean;
  loadingSummary: boolean;
  saving: boolean;
  summary: FoodMealPlanSummary | null;
  onExportCsv: () => void;
};

function MealPlannerTab({
  recipes,
  mealPlans,
  form,
  setForm,
  selectedPlanId,
  onSelectPlan,
  onNewPlan,
  onSavePlan,
  onDeletePlan,
  onDuplicatePlan,
  loadingList,
  loadingSummary,
  saving,
  summary,
  onExportCsv,
}: MealPlannerTabProps) {
  const [timeDistribution, setTimeDistribution] = useState<TimeDistributionEntry[]>(() => initialTimeDistribution());

  const recipeOptions = useMemo(
    () =>
      [{ value: '', label: 'Seleccionar receta' }].concat(
        recipes.map(recipe => ({ value: String(recipe.id), label: `${recipe.name} · ${MEAL_LABELS[recipe.mealType]}` })),
      ),
    [recipes],
  );

  const updateEntry = (dayIndex: number, mealType: FoodMealType, field: 'recipeId' | 'servings', value: string) => {
    const key = `${dayIndex}-${mealType}`;
    setForm(prev => ({
      ...prev,
      entries: {
        ...prev.entries,
        [key]: {
          ...prev.entries[key],
          [field]: value,
        },
      },
    }));
  };

  const updateTimeEntry = (id: string, field: keyof Omit<TimeDistributionEntry, 'id'>, value: string) => {
    setTimeDistribution(prev => prev.map(entry => (entry.id === id ? { ...entry, [field]: value } : entry)));
  };

  const addTimeEntry = () => {
    setTimeDistribution(prev => [...prev, defaultTimeEntry()]);
  };

  const removeTimeEntry = (id: string) => {
    setTimeDistribution(prev => {
      const next = prev.filter(entry => entry.id !== id);
      if (next.length === 0) {
        return [defaultTimeEntry()];
      }
      return next;
    });
  };

  const printTimeDistribution = () => {
    if (typeof window === 'undefined') return;
    const printable = timeDistribution.length ? timeDistribution : [defaultTimeEntry()];
    const rowsHtml = printable
      .map(entry => {
        const timeLabel = entry.time ? entry.time.padStart(5, '0') : '—';
        const sanitize = (value: string) =>
          value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `<tr>
<td>${sanitize(timeLabel)}</td>
<td>${sanitize(entry.activity || 'Pendiente')}</td>
<td>${sanitize(entry.responsible || '—')}</td>
<td>${sanitize(entry.notes || '')}</td>
</tr>`;
      })
      .join('');
    const weekInfo = form.weekStart ? new Date(form.weekStart).toLocaleDateString() : 'sin fecha definida';
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Cuadro de distribución de tiempo</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
      h1 { font-size: 20px; margin-bottom: 8px; }
      p { margin: 0 0 12px 0; font-size: 12px; color: #475569; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #cbd5f5; padding: 8px; text-align: left; }
      th { background-color: #e2e8f0; font-weight: bold; }
      td { min-height: 24px; }
    </style>
  </head>
  <body>
    <h1>Cuadro de distribución de tiempo</h1>
    <p>${form.name || 'Menú semanal'} · ${weekInfo}</p>
    <table>
      <thead>
        <tr>
          <th>Hora</th>
          <th>Actividad</th>
          <th>Responsable</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <p style="margin-top: 16px; font-size: 11px;">Imprime y selecciona «Guardar como PDF» para archivar o compartir este cuadro.</p>
  </body>
</html>`;
    const printWindow = window.open('', '_blank', 'width=900,height=650');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Nombre del menú
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Semana 01"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Semana
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    value={form.weekStart}
                    onChange={e => setForm(prev => ({ ...prev, weekStart: e.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Notas
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    value={form.notes}
                    onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Observaciones, eventos, etc."
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:w-auto">
              <button
                type="button"
                onClick={onSavePlan}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Guardar menú
              </button>
              <button
                type="button"
                onClick={onNewPlan}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Nuevo
              </button>
              {selectedPlanId && (
                <button
                  type="button"
                  onClick={() => onDeletePlan(selectedPlanId)}
                  className="rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Eliminar
                </button>
              )}
              {selectedPlanId && (
                <button
                  type="button"
                  onClick={() => onDuplicatePlan(selectedPlanId)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Duplicar
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {DAY_LABELS.map((label, dayIndex) => (
              <div key={label} className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-600">{label}</p>
                <div className="space-y-3">
                  {PRIMARY_MEALS.map(meal => {
                    const key = `${dayIndex}-${meal}`;
                    const value = form.entries[key] ?? { recipeId: '', servings: '' };
                    return (
                      <div key={key} className="rounded border border-slate-100 p-2">
                        <label className="block text-xs font-medium text-slate-500">{MEAL_LABELS[meal]}</label>
                        <div className="mt-1 flex gap-2">
                          <select
                            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            value={value.recipeId}
                            onChange={e => updateEntry(dayIndex, meal, 'recipeId', e.target.value)}
                          >
                            {recipeOptions.map(option => (
                              <option key={`${key}-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="0"
                            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            value={value.servings}
                            onChange={e => updateEntry(dayIndex, meal, 'servings', e.target.value)}
                            placeholder="raciones"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Semanas guardadas</h3>
                <p className="text-xs text-slate-500">Selecciona un plan para reutilizarlo o ajustarlo.</p>
              </div>
              <span className="text-xs text-slate-500">{mealPlans.length} registros</span>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-auto">
              {loadingList && <p className="text-sm text-slate-500">Cargando menús…</p>}
              {!loadingList && mealPlans.length === 0 && <p className="text-sm text-slate-500">Aún no hay menús semanales.</p>}
              {!loadingList &&
                mealPlans.map(plan => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => onSelectPlan(plan.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selectedPlanId === plan.id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{plan.name}</span>
                      <span className="text-xs text-slate-500">
                        {plan.weekStart ? new Date(plan.weekStart).toLocaleDateString() : 'Sin fecha'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {plan.totalEntries} servicios · {plan.totalServings.toFixed(0)} raciones
                    </div>
                  </button>
                ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Lista de compras</h3>
                <p className="text-xs text-slate-500">Consolidado semanal por insumo.</p>
              </div>
              <button
                type="button"
                onClick={onExportCsv}
                disabled={!summary}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Descargar CSV
              </button>
            </div>
            {loadingSummary && <p className="text-sm text-slate-500">Calculando consumos…</p>}
            {!loadingSummary && !summary && <p className="text-sm text-slate-500">Selecciona y guarda un menú para ver los insumos.</p>}
            {!loadingSummary && summary && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-700">{summary.plan.name}</p>
                  <p className="text-slate-500">
                    {summary.totals.servings.toFixed(0)} raciones · Costo estimado {formatMoney(summary.totals.totalCost)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {summary.totals.entries} servicios · {summary.totals.uniqueRecipes} recetas
                  </p>
                </div>
                <div className="max-h-64 overflow-auto border border-slate-100">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-2 py-1 text-left">Ingrediente</th>
                        <th className="px-2 py-1 text-right">Cantidad</th>
                        <th className="px-2 py-1 text-left">Unidad</th>
                        <th className="px-2 py-1 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.ingredients.map(item => (
                        <tr key={`${item.name}-${item.ingredientId ?? 'x'}`} className="border-t border-slate-100">
                          <td className="px-2 py-1 text-slate-700">{item.name}</td>
                          <td className="px-2 py-1 text-right text-slate-600">{item.quantity.toFixed(3)}</td>
                          <td className="px-2 py-1 text-slate-500">{item.unit ?? 'sin unidad'}</td>
                          <td className="px-2 py-1 text-right text-slate-700">{formatMoney(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <TimeDistributionCard
        entries={timeDistribution}
        onAddEntry={addTimeEntry}
        onRemoveEntry={removeTimeEntry}
        onChangeEntry={updateTimeEntry}
        onPrint={printTimeDistribution}
      />
    </div>
  );
}

type TimeDistributionCardProps = {
  entries: TimeDistributionEntry[];
  onAddEntry: () => void;
  onRemoveEntry: (id: string) => void;
  onChangeEntry: (id: string, field: keyof Omit<TimeDistributionEntry, 'id'>, value: string) => void;
  onPrint: () => void;
};

function TimeDistributionCard({ entries, onAddEntry, onRemoveEntry, onChangeEntry, onPrint }: TimeDistributionCardProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Cuadro de distribución de tiempo</h3>
          <p className="text-xs text-slate-500">Organiza hitos diarios y exporta un PDF listo para imprimir.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddEntry}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Agregar fila
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Hora</th>
              <th className="px-3 py-2">Actividad</th>
              <th className="px-3 py-2">Responsable</th>
              <th className="px-3 py-2">Notas</th>
              <th className="px-2 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(entry => (
              <tr key={entry.id}>
                <td className="px-3 py-2">
                  <input
                    type="time"
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                    value={entry.time}
                    onChange={e => onChangeEntry(entry.id, 'time', e.target.value)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                    placeholder="Actividad"
                    value={entry.activity}
                    onChange={e => onChangeEntry(entry.id, 'activity', e.target.value)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                    placeholder="Encargado"
                    value={entry.responsible}
                    onChange={e => onChangeEntry(entry.id, 'responsible', e.target.value)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                    placeholder="Observaciones"
                    value={entry.notes}
                    onChange={e => onChangeEntry(entry.id, 'notes', e.target.value)}
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemoveEntry(entry.id)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-500"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Tip: deja el desayuno programado a las 6:00 a.m. y agrega hitos como movilización, tareas y descansos para toda la cuadrilla.
      </p>
    </section>
  );
}
