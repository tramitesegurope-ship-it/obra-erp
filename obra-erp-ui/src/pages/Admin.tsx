import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KpiCard from '../components/KpiCard';
import { SearchableSelect } from '../components/SearchableSelect';
import api, {
  adminApi,
  type AdminExpenseRow,
  type AdminIncomeRow,
  type CreateExpensePayload,
  type CreateIncomePayload,
} from '../lib/api';
import type {
  DocType,
  ExpenseCategory,
  ExpenseKind,
  ExpenseType,
  Frente,
  Material,
  Obra,
  PaymentMethod,
  Proveedor,
  VariableType,
} from '../lib/types';
import { useDeleteAuth } from '../hooks/useDeleteAuth';

type Row = {
  id: number;
  date?: string;
  description?: string;
  total?: number;
  base?: number;
  igv?: number;
  source?: string;
};

type CreditoRow = {
  id: number;
  date?: string;
  proveedor?: string;
  docType?: DocType | null;
  docSerie?: string | null;
  docNumero?: string | null;
  base: number;
  igv: number;
  total: number;
  spentBy?: string | null;
};

const asNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : Number(value);
};

const normalizeIncome = (item: AdminIncomeRow): Row => {
  const base = asNumber(item.base);
  const igv = asNumber(item.igv);
  const total = asNumber(item.total) ?? (base ?? 0) + (igv ?? 0);
  return {
    id: item.id,
    date: item.date,
    description: item.description ?? undefined,
    total,
    base,
    igv,
    source: item.source ?? undefined,
  };
};

const DOC_TYPES: DocType[] = ['FACTURA', 'BOLETA', 'RECIBO', 'OTRO'];
const DOC_TYPES_REQUIRE_SERIE: ReadonlyArray<DocType> = ['FACTURA', 'BOLETA', 'RECIBO'];
const docTypeRequiresSerie = (docType?: DocType | '' | null) =>
  !!docType && DOC_TYPES_REQUIRE_SERIE.includes(docType);
const EXPENSE_TYPES: ExpenseType[] = ['DIRECTO', 'INDIRECTO'];
const VARIABLE_TYPES: VariableType[] = ['FIJO', 'VARIABLE'];
const PAYMENT_METHODS: PaymentMethod[] = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'TARJETA',
  'YAPE',
  'PLIN',
  'OTRO',
];
const EXPENSE_STATUS = ['REGISTRADO', 'PENDIENTE', 'PAGADO', 'ANULADO'] as const;
type ExpenseStatus = (typeof EXPENSE_STATUS)[number];
const SPENT_BY_OPTIONS = ['Carmelo', 'Fredy', 'Joselito'] as const;
const SPENT_BY_SELECT_OPTIONS = SPENT_BY_OPTIONS.map((name) => ({ value: name, label: name }));
const normalizeSpentByInput = (value?: string | null) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === 'fredi') return 'Fredy';
  return trimmed;
};
const spentByKey = (value?: string | null) => normalizeSpentByInput(value).toLowerCase();
const CATEGORY_KIND_LABEL: Record<ExpenseKind, string> = {
  MATERIAL_COMPRA: 'Compras de materiales',
  MATERIAL_CONSUMO: 'Consumo valorizado',
  OPERATIVO: 'Gasto operativo',
  ADMINISTRATIVO: 'Gasto administrativo',
  FINANCIERO: 'Gasto financiero',
  OTROS: 'Otros',
};
const COST_CATEGORY_KINDS = new Set<ExpenseKind>([
  'MATERIAL_COMPRA',
  'MATERIAL_CONSUMO',
]);
const getKindLabel = (kind?: ExpenseKind | null) =>
  CATEGORY_KIND_LABEL[kind ?? 'OTROS'];
type ReminderCategoryRule = {
  defaultDays?: number;
};

const REMINDER_CATEGORY_RULES: Record<string, ReminderCategoryRule> = {
  'alquileres y servicios': {},
  'seguros y garantías': { defaultDays: 30 },
};
const EXPENSE_KIND_OPTIONS: Array<{ value: ExpenseKind; label: string; helper: string }> = [
  {
    value: 'MATERIAL_COMPRA',
    label: 'Costo — Compra de materiales',
    helper: 'Facturas de ingreso a almacén (IN).',
  },
  {
    value: 'MATERIAL_CONSUMO',
    label: 'Costo — Consumo valorizado',
    helper: 'Salidas valorizadas hacia la obra (OUT).',
  },
  {
    value: 'OPERATIVO',
    label: 'Gasto operativo',
    helper: 'Planillas, alimentación, alquileres, logística.',
  },
  {
    value: 'ADMINISTRATIVO',
    label: 'Gasto administrativo',
    helper: 'Gerencia, contabilidad, trámites y soporte central.',
  },
  {
    value: 'FINANCIERO',
    label: 'Gasto financiero',
    helper: 'Seguros, intereses, garantías.',
  },
  {
    value: 'OTROS',
    label: 'Otros',
    helper: 'Cualquier egreso no cubierto arriba.',
  },
];
const IGV_RATE_DEFAULT = 0.18;
const DEFAULT_FRENTE_NAME = 'Frente Centro';

const todayInputValue = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const toInputDate = (value?: string | null) => {
  if (!value) return todayInputValue();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const pretty = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();
const isCostKind = (kind?: ExpenseKind | null) =>
  kind ? COST_CATEGORY_KINDS.has(kind) : false;

type IncomeFormState = {
  obraId: number;
  frenteId: number | '';
  description: string;
  docType: DocType;
  docSerie: string;
  docNumero: string;
  date: string;
  total: string;
  taxable: boolean;
  igvRate: number;
};

type ExpenseFormState = {
  obraId: number;
  frenteId: number | '';
  proveedorId: number | '';
  proveedorName: string;
  materialId: number | '';
  categoryId: number | '';
  docType: DocType;
  docSerie: string;
  docNumero: string;
  description: string;
  spentBy: string;
  date: string;
  type: ExpenseType;
  variableType: VariableType;
  paymentMethod: PaymentMethod;
  quantity: string;
  unitCost: string;
  total: string;
  taxable: boolean;
  igvRate: number;
  status: ExpenseStatus;
  reminderDays: string;
  reminderNextDate?: string | null;
};

type ProviderDefaults = {
  docSerie: string | null;
  docType: DocType | null;
  categoryId: number | null;
  type: ExpenseType | null;
  variableType: VariableType | null;
  isTaxable: boolean | null;
  igvRate: number | null;
  paymentMethod: PaymentMethod | null;
  spentBy: string | null;
};

type AlertState = { type: 'success' | 'error'; text: string } | null;

const createIncomeState = (
  obra: number,
  frente: number | '' = '',
  dateValue: string = todayInputValue(),
): IncomeFormState => ({
  obraId: obra,
  frenteId: frente,
  description: '',
  docType: 'FACTURA',
  docSerie: '',
  docNumero: '',
  date: dateValue,
  total: '',
  taxable: true,
  igvRate: IGV_RATE_DEFAULT,
});

const createExpenseState = (
  obra: number,
  frente: number | '' = '',
  dateValue: string = todayInputValue(),
): ExpenseFormState => ({
  obraId: obra,
  frenteId: frente,
  proveedorId: '',
  proveedorName: '',
  materialId: '',
  categoryId: '',
  docType: 'FACTURA',
  docSerie: '',
  docNumero: '',
  description: '',
  spentBy: '',
  date: dateValue,
  type: 'DIRECTO',
  variableType: 'FIJO',
  paymentMethod: 'EFECTIVO',
  quantity: '',
  unitCost: '',
  total: '',
  taxable: true,
  igvRate: IGV_RATE_DEFAULT,
  status: 'PAGADO',
  reminderDays: '',
  reminderNextDate: null,
});

export default function Admin() {
  const [obraId, setObraId] = useState<number>(1);
  const [obras, setObras] = useState<Obra[]>([]);
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [incomeForm, setIncomeForm] = useState<IncomeFormState>(() =>
    createIncomeState(1),
  );
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(() =>
    createExpenseState(1),
  );
  const [pettyCashMode, setPettyCashMode] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [incomeAlert, setIncomeAlert] = useState<AlertState>(null);
  const [expenseAlert, setExpenseAlert] = useState<AlertState>(null);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [categoryKind, setCategoryKind] = useState<ExpenseKind>('OPERATIVO');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryAlert, setCategoryAlert] = useState<AlertState>(null);
  const [resetAlert, setResetAlert] = useState<AlertState>(null);
  const [resetting, setResetting] = useState(false);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | ''>('');
  const [spentByFilter, setSpentByFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [totales, setTotales] = useState({
    ingresos: 0,
    egresosCompras: 0,
    egresosConsumo: 0,
    egresosOperativos: 0,
    egresos: 0,
    margen: 0,
    margenPct: 0,
    operativosPct: 0,
    comprasBaseGravada: 0,
    comprasIgv: 0,
    comprasTotal: 0,
    facturasConIgv: 0,
  });
  const [flujo, setFlujo] = useState<
    {
      date: string;
      ingresos: number;
      compras: number;
      consumo: number;
      operativos: number;
      egresos: number;
      neto: number;
    }[]
  >([]);
  const [egCat, setEgCat] = useState<
    { category: string; kind: ExpenseKind; amount: number }[]
  >([]);
  const [incomes, setIncomes] = useState<Row[]>([]);
  const [rawIncomes, setRawIncomes] = useState<AdminIncomeRow[]>([]);
  const [rawExpenses, setRawExpenses] = useState<AdminExpenseRow[]>([]);
  const [alerts, setAlerts] = useState<
    { level: 'info' | 'warn' | 'danger'; title: string; detail: string }[]
  >([]);
  const [comprasCredito, setComprasCredito] = useState<CreditoRow[]>([]);
  const [editingIncomeId, setEditingIncomeId] = useState<number | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [deletingIncomeId, setDeletingIncomeId] = useState<number | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);
  const deleteUnlocked = useDeleteAuth();
  const ensureDeleteUnlocked = () => {
    if (!deleteUnlocked) {
      window.alert('Debes desbloquear las eliminaciones en Seguridad antes de borrar ingresos o egresos.');
      return false;
    }
    return true;
  };
  const [expenseSearch, setExpenseSearch] = useState('');
  const providerDefaultsRef = useRef<Map<number, ProviderDefaults>>(new Map());
  const spentByInputRef = useRef<HTMLInputElement>(null);
  const expenseDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const focusSpentByField = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      const input = spentByInputRef.current;
      if (!input) return;
      input.focus();
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
        (input as HTMLInputElement & { showPicker?: () => void }).showPicker();
      } else {
        input.select();
      }
    });
  }, []);

  useEffect(() => {
    focusSpentByField();
  }, [focusSpentByField]);
  const filteredExpenses = useMemo(() => {
    const target = spentByKey(spentByFilter);
    if (!target) return rawExpenses;
    return rawExpenses.filter((item) => spentByKey(item.spentBy) === target);
  }, [rawExpenses, spentByFilter]);

  const expenseDocNeedsSerie = docTypeRequiresSerie(expenseForm.docType);
  const expenseDocInputsDisabled = pettyCashMode || !expenseDocNeedsSerie;

  useEffect(() => {
    (async () => {
      try {
        const [obraRes, frenteRes, provRes, matRes, catRes] = await Promise.all([
          api.get<Obra[]>('/obras'),
          api.get<Frente[]>('/frentes'),
          api.get<Proveedor[]>('/proveedores'),
          api.get<Material[]>('/materials'),
          adminApi.expenseCategories(),
        ]);
        setObras(obraRes);
        setFrentes(frenteRes);
        setProveedores(
          provRes.slice().sort((a, b) =>
            a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
          ),
        );
        setMaterials(matRes);
        setCategories(
          catRes.items.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );

        const fallback = obraRes[0]?.id;
        if (fallback !== undefined) {
          setObraId((prev) => {
            if (!obraRes.some((o) => o.id === prev)) {
              return fallback;
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Error cargando catálogos base', error);
      }
    })();
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });
  const formatDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('es-PE') : '—';

const computeTaxParts = useCallback(
  (total: number, igvRate: number, taxable: boolean) => {
    if (!Number.isFinite(total) || total <= 0) return { base: 0, igv: 0 };
    if (!taxable) return { base: round2(total), igv: 0 };
    const rate = igvRate > 0 ? igvRate : IGV_RATE_DEFAULT;
    const base = round2(total / (1 + rate));
    const igv = round2(total - base);
    return { base, igv };
  },
  [],
);

const startOfDay = (value: Date) => {
  const out = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  return out;
};

  const frentesByObra = useMemo(
    () => frentes.filter((f) => f.obraId === obraId),
    [frentes, obraId],
  );

  const reminderAlerts = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const msInDay = 1000 * 60 * 60 * 24;

    return filteredExpenses
      .filter((item) => item.reminderNextDate && item.reminderIntervalDays)
      .map((item) => {
        const due = new Date(item.reminderNextDate as string);
        const dueDay = startOfDay(due);
        const diffDays = Math.round((dueDay.getTime() - today.getTime()) / msInDay);
        if (diffDays < -30) return null;

        let status: 'dueSoon' | 'overdue' | null = null;
        if (diffDays < 0) status = 'overdue';
        else if (diffDays <= 2) status = 'dueSoon';
        else return null;

        const label =
          item.description?.trim() ||
          item.category?.name?.trim() ||
          item.proveedor?.name?.trim() ||
          `Egreso #${item.id}`;

        return {
          id: item.id,
          label,
          dueDate: dueDay,
          diffDays,
          status,
        };
      })
      .filter((value): value is {
        id: number;
        label: string;
        dueDate: Date;
        diffDays: number;
        status: 'dueSoon' | 'overdue';
      } => value !== null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [filteredExpenses]);

  const reminderPreviewDate = useMemo(() => {
    const value = expenseForm.reminderDays.trim();
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const base = expenseForm.date ? new Date(expenseForm.date) : new Date();
    const baseDay = startOfDay(base);
    baseDay.setDate(baseDay.getDate() + Math.round(parsed));
    return baseDay;
  }, [expenseForm.date, expenseForm.reminderDays]);

  const defaultFrenteId = useMemo<number | ''>(() => {
    if (frentesByObra.length === 0) return '';
    const target = DEFAULT_FRENTE_NAME.toLowerCase();
    const exact = frentesByObra.find(
      (fr) => fr.name.trim().toLowerCase() === target,
    );
    const selected = exact ?? frentesByObra[0];
    return selected ? selected.id : '';
  }, [frentesByObra]);

  const obraActual = useMemo(
    () => obras.find((o) => o.id === obraId)?.name ?? `Obra #${obraId}`,
    [obras, obraId],
  );

  const obraOptions = useMemo(
    () => obras.map((obra) => ({ value: obra.id, label: obra.name })),
    [obras],
  );
  const incomeFrenteOptions = useMemo(
    () =>
      frentes
        .filter((frente) => frente.obraId === incomeForm.obraId)
        .map((frente) => ({ value: frente.id, label: frente.name })),
    [frentes, incomeForm.obraId],
  );
  const expenseFrenteOptions = useMemo(
    () =>
      frentes
        .filter((frente) => frente.obraId === expenseForm.obraId)
        .map((frente) => ({ value: frente.id, label: frente.name })),
    [frentes, expenseForm.obraId],
  );
  const proveedorOptions = useMemo(
    () => proveedores.map((prov) => ({ value: prov.id, label: prov.name })),
    [proveedores],
  );
  const materialOptions = useMemo(
    () => materials.map((mat) => ({ value: mat.id, label: mat.name })),
    [materials],
  );
  const categoryOptions = useMemo(
    () => categories.map((cat) => ({ value: cat.id, label: cat.name })),
    [categories],
  );
  const pettyCashCategoryId = useMemo(() => {
    const normalized = categories.map(cat => ({ id: cat.id, name: cat.name.toLowerCase() }));
    const match =
      normalized.find(cat => cat.name.includes('caja chica')) ??
      normalized.find(cat => cat.name.includes('gastos administrativos'));
    return match?.id ?? null;
  }, [categories]);
  const pettyCashProviderId = useMemo(() => {
    const match = proveedores.find(
      prov => prov.name.trim().toLowerCase() === 'caja chica' || prov.name.trim().toLowerCase() === 'proveedor caja chica',
    );
    return match?.id ?? null;
  }, [proveedores]);
  const normalizeCategoryName = useCallback((name: string) => name.trim().toLowerCase(), []);
  const getReminderCategoryConfig = useCallback(
    (categoryId: number | ''): ReminderCategoryRule | null => {
      if (categoryId === '') return null;
      const category = categories.find((cat) => cat.id === categoryId);
      if (!category) return null;
      const rule =
        REMINDER_CATEGORY_RULES[normalizeCategoryName(category.name)] ?? null;
      return rule;
    },
    [categories, normalizeCategoryName],
  );
  const reminderCategoryConfig = useMemo(
    () => getReminderCategoryConfig(expenseForm.categoryId),
    [expenseForm.categoryId, getReminderCategoryConfig],
  );
  const reminderFieldVisible = !!reminderCategoryConfig;
  const docTypeOptions = useMemo(
    () => DOC_TYPES.map((doc) => ({ value: doc, label: pretty(doc) })),
    [],
  );
  const expenseTypeOptions = useMemo(
    () => EXPENSE_TYPES.map((type) => ({ value: type, label: pretty(type) })),
    [],
  );
  const variableTypeOptions = useMemo(
    () => VARIABLE_TYPES.map((type) => ({ value: type, label: pretty(type) })),
    [],
  );
const paymentMethodOptions = useMemo(
  () => PAYMENT_METHODS.map((method) => ({ value: method, label: pretty(method) })),
  [],
);
const expenseStatusOptions = useMemo(
  () => EXPENSE_STATUS.map((status) => ({ value: status, label: pretty(status) })),
  [],
);
const categoryKindOptions = useMemo(
  () => EXPENSE_KIND_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
  [],
);

  useEffect(() => {
    setExpenseForm(prev => {
      let changed = false;
      const next = { ...prev };

      if (pettyCashMode) {
        if (prev.docType !== 'OTRO') {
          next.docType = 'OTRO';
          changed = true;
        }
        if (prev.docSerie !== '') {
          next.docSerie = '';
          changed = true;
        }
        if (prev.docNumero !== '') {
          next.docNumero = '';
          changed = true;
        }
        if (prev.taxable !== false) {
          next.taxable = false;
          changed = true;
        }
        if (prev.igvRate !== 0) {
          next.igvRate = 0;
          changed = true;
        }
        if (pettyCashCategoryId && (prev.categoryId === '' || prev.categoryId === pettyCashCategoryId)) {
          next.categoryId = pettyCashCategoryId;
          changed = true;
        }
        if (pettyCashProviderId) {
          if (prev.proveedorId !== pettyCashProviderId) {
            next.proveedorId = pettyCashProviderId;
            const prov = proveedores.find(p => p.id === pettyCashProviderId);
            next.proveedorName = prov?.name ?? 'Caja chica';
            changed = true;
          }
        } else if (!prev.proveedorName.trim()) {
          next.proveedorId = '';
          next.proveedorName = 'Caja chica';
          changed = true;
        }
      } else {
        if (prev.docType === 'OTRO') {
          next.docType = 'FACTURA';
          changed = true;
        }
        if (prev.taxable === false) {
          next.taxable = true;
          changed = true;
        }
        if (prev.igvRate === 0) {
          next.igvRate = IGV_RATE_DEFAULT;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [pettyCashMode, pettyCashCategoryId, pettyCashProviderId, proveedores]);

  useEffect(() => {
    if (editingExpenseId) {
      setPettyCashMode(false);
    }
  }, [editingExpenseId]);

  const incomePreview = useMemo(() => {
    const total = Number(incomeForm.total);
    if (!Number.isFinite(total) || total <= 0) return { base: 0, igv: 0 };
    const taxable =
      incomeForm.docType === 'FACTURA' && incomeForm.taxable;
    const rate = taxable ? incomeForm.igvRate || IGV_RATE_DEFAULT : 0;
    return computeTaxParts(total, rate, taxable);
  }, [
    computeTaxParts,
    incomeForm.docType,
    incomeForm.igvRate,
    incomeForm.taxable,
    incomeForm.total,
  ]);

  const expensePreview = useMemo(() => {
    const total = Number(expenseForm.total);
    if (!Number.isFinite(total) || total <= 0) return { base: 0, igv: 0 };
    const taxable =
      expenseForm.docType === 'FACTURA' && expenseForm.taxable;
    const rate = taxable ? expenseForm.igvRate || IGV_RATE_DEFAULT : 0;
    return computeTaxParts(total, rate, taxable);
  }, [
    computeTaxParts,
    expenseForm.docType,
    expenseForm.igvRate,
    expenseForm.taxable,
    expenseForm.total,
  ]);

  const totalCostos = useMemo(
    () => totales.egresosCompras + totales.egresosConsumo,
    [totales.egresosCompras, totales.egresosConsumo],
  );

  const totalGastos = useMemo(
    () => totales.egresosOperativos,
    [totales.egresosOperativos],
  );

  const margenNeto = useMemo(
    () => totales.ingresos - totalCostos - totalGastos,
    [totales.ingresos, totalCostos, totalGastos],
  );

  const costoEntries = useMemo(
    () =>
      filteredExpenses
        .filter((item) => isCostKind(item.category?.kind))
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          fecha: formatDate(item.date),
          detalle:
            item.description ??
            item.material?.name ??
            item.category?.name ??
            '—',
          categoria:
            item.category?.name ?? getKindLabel(item.category?.kind ?? null),
          spentBy: normalizeSpentByInput(item.spentBy ?? '') || null,
          total: fmt(asNumber(item.total) ?? 0),
        })),
    [filteredExpenses],
  );

  const gastoEntries = useMemo(
    () =>
      filteredExpenses
        .filter((item) => !isCostKind(item.category?.kind))
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          fecha: formatDate(item.date),
          detalle: item.description ?? item.category?.name ?? '—',
          categoria:
            item.category?.name ?? getKindLabel(item.category?.kind ?? null),
          spentBy: normalizeSpentByInput(item.spentBy ?? '') || null,
          total: fmt(asNumber(item.total) ?? 0),
        })),
    [filteredExpenses],
  );

  const expenseSearchResults = useMemo(() => {
    const rawTerm = expenseSearch.trim();
    const term = rawTerm.toLowerCase();
    if (term.length < 2) return [];

    const matchesTerm = (value?: string | null) =>
      value ? value.toLowerCase().includes(term) : false;

    const digitTerm = rawTerm.replace(/[^0-9.,-]/g, '');
    const hasNumeric = /[0-9]/.test(digitTerm);
    const numericTerm = hasNumeric ? Number(digitTerm.replace(',', '.')) : null;

    const matchesAmount = (value?: number | null) => {
      if (!hasNumeric || numericTerm === null) return false;
      if (value === null || value === undefined || Number.isNaN(value)) return false;
      const normalizedValue = Number(value);
      if (!Number.isFinite(normalizedValue)) return false;
      const diff = Math.abs(normalizedValue - numericTerm);
      if (diff < 0.01) return true;
      const valueString = normalizedValue.toFixed(2);
      const normalizedDigits = digitTerm.replace(/[,]/g, '.');
      return valueString.includes(normalizedDigits);
    };

    return filteredExpenses
      .filter((item) => {
        const serie = item.docSerie?.toLowerCase() ?? '';
        const numero = item.docNumero?.toLowerCase() ?? '';
        const combined = `${serie}-${numero}`.replace(/^-|-$/g, '');
        const provider = item.proveedor?.name?.toLowerCase() ?? '';
        const description = item.description?.toLowerCase() ?? '';
        const material = item.material?.name?.toLowerCase() ?? '';
        const spentBy = spentByKey(item.spentBy);
        const totalAmount = asNumber(item.total) ?? null;
        const baseAmount = asNumber(item.base) ?? null;
        const igvAmount = asNumber(item.igv) ?? null;

        return (
          matchesTerm(item.docType ?? undefined) ||
          (serie && serie.includes(term)) ||
          (numero && numero.includes(term)) ||
          (combined && combined.includes(term)) ||
          provider.includes(term) ||
          description.includes(term) ||
          material.includes(term) ||
          spentBy.includes(term) ||
          matchesAmount(totalAmount) ||
          matchesAmount(baseAmount) ||
          matchesAmount(igvAmount)
        );
      })
      .slice(0, 20)
      .map((item) => {
        const serie = item.docSerie?.toUpperCase() ?? '';
        const numero = item.docNumero?.toUpperCase() ?? '';
        const docParts: string[] = [];
        if (item.docType) docParts.push(pretty(item.docType));
        const docNumber = [serie, numero].filter(Boolean).join('-');
        if (docNumber) docParts.push(docNumber);
        const documento = docParts.length > 0 ? docParts.join(' ') : 'Sin documento';

        return {
          id: item.id,
          fecha: formatDate(item.date),
          proveedor: item.proveedor?.name ?? item.description ?? '—',
          categoria:
            item.category?.name ?? getKindLabel(item.category?.kind ?? null),
          documento,
          spentBy: item.spentBy ?? null,
          total: fmt(asNumber(item.total) ?? 0),
        };
      });
  }, [expenseSearch, filteredExpenses, fmt, formatDate]);

  const comprasCreditoFiltered = useMemo(() => {
    const target = spentByKey(spentByFilter);
    if (!target) return comprasCredito;
    return comprasCredito.filter((row) => {
      const value = spentByKey(row.spentBy);
      return value === target;
    });
  }, [comprasCredito, spentByFilter]);

  const categoryKindInfo = useMemo(
    () =>
      EXPENSE_KIND_OPTIONS.find((opt) => opt.value === categoryKind) ??
      EXPENSE_KIND_OPTIONS[0],
    [categoryKind],
  );

  useEffect(() => {
    setIncomeForm((prev) => {
      const hasValidFrente =
        prev.frenteId !== '' &&
        frentesByObra.some((fr) => fr.id === prev.frenteId);
      const nextFrenteId = hasValidFrente ? prev.frenteId : defaultFrenteId;
      if (prev.obraId === obraId && prev.frenteId === nextFrenteId) {
        return prev;
      }
      return { ...prev, obraId, frenteId: nextFrenteId };
    });

    setExpenseForm((prev) => {
      const hasValidFrente =
        prev.frenteId !== '' &&
        frentesByObra.some((fr) => fr.id === prev.frenteId);
      const nextFrenteId = hasValidFrente ? prev.frenteId : defaultFrenteId;
      if (prev.obraId === obraId && prev.frenteId === nextFrenteId) {
        return prev;
      }
      return { ...prev, obraId, frenteId: nextFrenteId };
    });
  }, [obraId, defaultFrenteId, frentesByObra]);

  useEffect(() => {
    if (editingExpenseId !== null) return;
    if (typeof expenseForm.proveedorId !== 'number') return;
    const providerId = expenseForm.proveedorId;
    const currentObraId = expenseForm.obraId;

    const applyDefaults = (defaults: ProviderDefaults) => {
      setExpenseForm((prev) => {
        if (editingExpenseId !== null || prev.proveedorId !== providerId) {
          return prev;
        }
        let changed = false;
        const next = { ...prev };
        const trimmedSerie = prev.docSerie.trim();
        const trimmedNumero = prev.docNumero.trim();
        const currentSpentBy = normalizeSpentByInput(prev.spentBy);

        if (defaults.docSerie && trimmedSerie === '') {
          next.docSerie = defaults.docSerie.toUpperCase();
          changed = true;
        }
        if (
          defaults.docType &&
          trimmedSerie === '' &&
          trimmedNumero === '' &&
          prev.docType !== defaults.docType
        ) {
          next.docType = defaults.docType;
          changed = true;
        }
        if (
          typeof defaults.isTaxable === 'boolean' &&
          trimmedSerie === '' &&
          trimmedNumero === '' &&
          prev.taxable !== defaults.isTaxable
        ) {
          next.taxable = defaults.isTaxable;
          changed = true;
        }
        if (
          typeof defaults.igvRate === 'number' &&
          prev.docType === 'FACTURA' &&
          Math.abs(prev.igvRate - defaults.igvRate) > 0.0001
        ) {
          next.igvRate = defaults.igvRate;
          changed = true;
        }
        if (defaults.categoryId && prev.categoryId === '') {
          next.categoryId = defaults.categoryId;
          const config = getReminderCategoryConfig(defaults.categoryId);
          if (config) {
            const shouldApplyDefault = prev.reminderDays.trim() === '';
            const defaultDays =
              typeof config.defaultDays === 'number'
                ? String(config.defaultDays)
                : '';
            if (shouldApplyDefault) {
              next.reminderDays = defaultDays;
            }
            next.reminderNextDate = null;
          }
          changed = true;
        }
        if (defaults.type && prev.type === 'DIRECTO') {
          next.type = defaults.type;
          changed = true;
        }
        if (defaults.variableType && prev.variableType === 'FIJO') {
          next.variableType = defaults.variableType;
          changed = true;
        }
        if (
          defaults.paymentMethod &&
          prev.paymentMethod === 'EFECTIVO'
        ) {
          next.paymentMethod = defaults.paymentMethod;
          changed = true;
        }
        if (defaults.spentBy && currentSpentBy === '') {
          next.spentBy = defaults.spentBy;
          changed = true;
        }
        return changed ? next : prev;
      });
    };

    const cached = providerDefaultsRef.current.get(providerId);
    if (cached) {
      applyDefaults(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await adminApi.expenses(
          currentObraId,
          undefined,
          undefined,
          undefined,
          { proveedorId: providerId, limit: 1 },
        );
        const last = res.items?.[0];
        if (!last) return;
        const defaults: ProviderDefaults = {
          docSerie: last.docSerie ? last.docSerie.toUpperCase() : null,
          docType: (last.docType as DocType | null) ?? null,
          categoryId: last.categoryId ?? null,
          type: last.type ?? null,
          variableType: last.variableType ?? null,
          isTaxable: typeof last.isTaxable === 'boolean' ? last.isTaxable : null,
          igvRate: typeof last.igvRate === 'number' ? last.igvRate : null,
          paymentMethod: last.paymentMethod ?? null,
          spentBy: normalizeSpentByInput(last.spentBy ?? '') || null,
        };
        providerDefaultsRef.current.set(providerId, defaults);
        if (!cancelled) {
          applyDefaults(defaults);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('No se pudo cargar el historial del proveedor', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expenseForm.obraId, expenseForm.proveedorId, editingExpenseId, getReminderCategoryConfig]);

const suggestedExpenseTotal = useMemo(() => {
  const qty = Number(expenseForm.quantity);
  const unit = Number(expenseForm.unitCost);
  if (Number.isFinite(qty) && qty > 0 && Number.isFinite(unit) && unit > 0) {
    return round2(qty * unit);
  }
  return undefined;
}, [expenseForm.quantity, expenseForm.unitCost]);

  useEffect(() => {
    if (typeof suggestedExpenseTotal !== 'number') return;
    const formatted = suggestedExpenseTotal.toFixed(2);
    setExpenseForm(prev => {
      if (prev.total === formatted) return prev;
      return { ...prev, total: formatted };
    });
  }, [suggestedExpenseTotal]);

  const rememberProviderDefaults = useCallback((row?: AdminExpenseRow | null) => {
    if (!row?.proveedorId) return;
    providerDefaultsRef.current.set(row.proveedorId, {
      docSerie: row.docSerie ? row.docSerie.toUpperCase() : null,
      docType: (row.docType as DocType | null) ?? null,
      categoryId: row.categoryId ?? null,
      type: row.type ?? null,
      variableType: row.variableType ?? null,
      isTaxable: typeof row.isTaxable === 'boolean' ? row.isTaxable : null,
      igvRate: typeof row.igvRate === 'number' ? row.igvRate : null,
      paymentMethod: row.paymentMethod ?? null,
      spentBy: normalizeSpentByInput(row.spentBy ?? '') || null,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, incomesRes, expensesRes] = await Promise.all([
        adminApi.summary(obraId, from || undefined, to || undefined),
        adminApi.incomes(obraId, from || undefined, to || undefined),
        adminApi.expenses(
          obraId,
          from || undefined,
          to || undefined,
          docTypeFilter || undefined,
        ),
      ]);
      setTotales(summary.totales);
      setFlujo(summary.flujo);
      setEgCat(summary.egresosPorCategoria);
      setAlerts(summary.alerts ?? []);
      setRawIncomes(incomesRes.items);
      setIncomes(incomesRes.items.slice(0, 10).map(normalizeIncome));
      const normalizedExpenses = expensesRes.items.map((item) => ({
        ...item,
        spentBy: normalizeSpentByInput(item.spentBy ?? '') || null,
      }));
      setRawExpenses(normalizedExpenses);
      const creditoRows = normalizedExpenses
        .filter(
          (item) =>
            item.category?.kind === 'MATERIAL_COMPRA' &&
            item.docType === 'FACTURA' &&
            item.isTaxable !== false,
        )
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          date: item.date,
          proveedor: item.proveedor?.name ?? item.description ?? undefined,
          docType: item.docType ?? null,
          docSerie: item.docSerie ?? null,
          docNumero: item.docNumero ?? null,
          base: asNumber(item.base) ?? 0,
          igv: asNumber(item.igv) ?? 0,
          total: asNumber(item.total) ?? 0,
          spentBy: item.spentBy ?? null,
        }));
      setComprasCredito(creditoRows);
    } finally {
      setLoading(false);
    }
  }, [obraId, docTypeFilter, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const resetIncomeForm = useCallback(() => {
    setIncomeForm(createIncomeState(obraId, defaultFrenteId));
    setEditingIncomeId(null);
  }, [obraId, defaultFrenteId]);

  const resetExpenseForm = useCallback(() => {
    setExpenseForm(createExpenseState(obraId, defaultFrenteId));
    setEditingExpenseId(null);
    focusSpentByField();
  }, [obraId, defaultFrenteId, focusSpentByField]);

  const handlePrintExpenses = useCallback(() => {
    if (filteredExpenses.length === 0) {
      window.alert('No hay egresos con los filtros seleccionados para imprimir.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow || !printWindow.document) {
      window.alert('No se pudo abrir la ventana de impresión. Revisa el bloqueador de ventanas emergentes.');
      return;
    }
    const { document: printDoc } = printWindow;

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const sorted = filteredExpenses
      .slice()
      .sort((a, b) => {
        const da = a.date ?? '';
        const db = b.date ?? '';
        return da.localeCompare(db);
      });

    const totalBase = sorted.reduce((acc, item) => acc + (asNumber(item.base) ?? 0), 0);
    const totalIgv = sorted.reduce((acc, item) => acc + (asNumber(item.igv) ?? 0), 0);
    const totalMonto = sorted.reduce((acc, item) => acc + (asNumber(item.total) ?? 0), 0);

    const rangeText =
      from || to
        ? `${from ? new Date(from).toLocaleDateString('es-PE') : '—'} – ${
            to ? new Date(to).toLocaleDateString('es-PE') : '—'
          }`
        : 'Todo el historial';

    const obraNombre =
      obras.find((obra) => obra.id === obraId)?.name ?? `Obra #${obraId}`;
    const docTypeText = docTypeFilter ? pretty(docTypeFilter) : 'Todos';
    const spentByText = spentByFilter ? spentByFilter : 'Todos';

    const rowsHtml = sorted
      .map((item, index) => {
        const fecha = formatDate(item.date);
        const docType = item.docType ?? '—';
        const serie = item.docSerie ? escapeHtml(item.docSerie.toUpperCase()) : '—';
        const numero = item.docNumero ? escapeHtml(item.docNumero) : '—';
        const proveedor = item.proveedor?.name
          ? escapeHtml(item.proveedor.name)
          : '—';
        const categoria = item.category?.name
          ? escapeHtml(item.category.name)
          : getKindLabel(item.category?.kind ?? null);
        const descripcion = item.description
          ? escapeHtml(item.description)
          : '—';
        const spentBy = item.spentBy ? escapeHtml(item.spentBy) : '—';
        const pago = item.paymentMethod ?? '—';
        const estado = item.status ?? '—';
        const base = fmt(asNumber(item.base) ?? 0);
        const igv = fmt(asNumber(item.igv) ?? 0);
        const total = fmt(asNumber(item.total) ?? 0);

        return `<tr>
          <td class="text-center">${index + 1}</td>
          <td>${fecha}</td>
          <td>${docType}</td>
          <td>${serie}</td>
          <td>${numero}</td>
          <td>${proveedor}</td>
          <td>${spentBy}</td>
          <td>${categoria}</td>
          <td>${descripcion}</td>
          <td class="numeric">${base}</td>
          <td class="numeric">${igv}</td>
          <td class="numeric">${total}</td>
          <td>${pago}</td>
          <td>${estado}</td>
        </tr>`;
      })
      .join('');

    const generatedAt = new Date().toLocaleString('es-PE');
    const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Reporte de egresos</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 12mm;
      }
      :root {
        color-scheme: only light;
      }
      body {
        font-family: "Inter", "Segoe UI", sans-serif;
        font-size: 10px;
        color: #0f172a;
        margin: 0;
      }
      h1 {
        font-size: 16px;
        margin: 0 0 4px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .header {
        text-align: center;
        margin-bottom: 12px;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        gap: 8px;
        font-size: 10px;
      }
      .meta span {
        display: inline-block;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      thead th {
        background: #e2e8f0;
        border: 1px solid #94a3b8;
        padding: 6px 4px;
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      tbody td {
        border: 1px solid #cbd5f5;
        padding: 4px 4px;
        vertical-align: top;
        word-break: break-word;
      }
      tbody tr:nth-child(even) td {
        background: #f8fafc;
      }
      .numeric {
        text-align: right;
        white-space: nowrap;
      }
      .text-center {
        text-align: center;
      }
      tfoot td {
        border: 1px solid #94a3b8;
        padding: 6px 4px;
        font-weight: 600;
        background: #e0f2fe;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Reporte detallado de egresos</h1>
      <div>${escapeHtml(obraNombre)}</div>
    </div>
    <div class="meta">
      <span><strong>Período:</strong> ${rangeText}</span>
      <span><strong>Documento:</strong> ${escapeHtml(docTypeText)}</span>
      <span><strong>Gastado por:</strong> ${escapeHtml(spentByText)}</span>
      <span><strong>Generado:</strong> ${generatedAt}</span>
      <span><strong>Total registros:</strong> ${sorted.length}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 28px;">#</th>
          <th style="width: 60px;">Fecha</th>
          <th style="width: 52px;">Doc</th>
          <th style="width: 58px;">Serie</th>
          <th style="width: 70px;">Número</th>
          <th>Proveedor</th>
          <th style="width: 90px;">Gastó</th>
          <th>Categoría</th>
          <th>Descripción</th>
          <th style="width: 70px;">Base</th>
          <th style="width: 60px;">IGV</th>
          <th style="width: 80px;">Total</th>
          <th style="width: 70px;">Pago</th>
          <th style="width: 70px;">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="9">Totales</td>
          <td class="numeric">${fmt(totalBase)}</td>
          <td class="numeric">${fmt(totalIgv)}</td>
          <td class="numeric">${fmt(totalMonto)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  </body>
</html>`;

    printDoc.open('text/html', 'replace');
    printDoc.write(html);
    printDoc.close();

    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      printWindow.focus();
      printWindow.print();
    };

    if (printDoc.readyState === 'complete') {
      triggerPrint();
    } else {
      printDoc.addEventListener('DOMContentLoaded', triggerPrint, { once: true });
    }
    setTimeout(triggerPrint, 800);
  }, [docTypeFilter, filteredExpenses, formatDate, from, fmt, obras, obraId, spentByFilter, to]);

  const toOptionalId = (value?: number | null): number | '' =>
    typeof value === 'number' ? value : '';

  const mapIncomeToForm = (target: AdminIncomeRow): IncomeFormState => {
    const docType = target.docType ?? 'FACTURA';
    const taxable = docType === 'FACTURA' ? target.isTaxable !== false : false;
    const totalValue =
      typeof target.total === 'number'
        ? target.total
        : typeof target.base === 'number' && typeof target.igv === 'number'
          ? target.base + target.igv
          : target.base ?? undefined;

    return {
      obraId: target.obraId ?? obraId,
      frenteId: toOptionalId(target.frenteId),
      description: target.description ?? '',
      docType,
      docSerie: target.docSerie ?? '',
      docNumero: target.docNumero ?? '',
      date: toInputDate(target.date),
      total: totalValue !== undefined ? String(totalValue) : '',
      taxable,
      igvRate: typeof target.igvRate === 'number' ? target.igvRate : IGV_RATE_DEFAULT,
    };
  };

  const handleEditIncome = (id: number) => {
    const target = rawIncomes.find((item) => item.id === id);
    if (!target) {
      setIncomeAlert({
        type: 'error',
        text: 'No se encontró el ingreso solicitado.',
      });
      return;
    }

    setIncomeForm(mapIncomeToForm(target));
    setEditingIncomeId(id);
    setIncomeAlert(null);
  };

  const handleDeleteIncome = async (id: number) => {
    if (!ensureDeleteUnlocked()) return;
    const confirmDelete = window.confirm(
      '¿Seguro que deseas eliminar este ingreso? Esta acción no se puede deshacer.',
    );
    if (!confirmDelete) return;

    setIncomeAlert(null);
    setDeletingIncomeId(id);
    try {
      await adminApi.deleteIncome(id);
      if (editingIncomeId === id) {
        resetIncomeForm();
      }
      setIncomeAlert({ type: 'success', text: 'Ingreso eliminado.' });
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setIncomeAlert({ type: 'error', text: msg });
    } finally {
      setDeletingIncomeId(null);
    }
  };

  const mapExpenseToForm = (target: AdminExpenseRow): ExpenseFormState => {
    const docType = target.docType ?? 'FACTURA';
    const taxable = docType === 'FACTURA' ? target.isTaxable !== false : false;
    const totalValue =
      typeof target.total === 'number'
        ? target.total
        : typeof target.base === 'number' && typeof target.igv === 'number'
          ? target.base + target.igv
          : target.base ?? undefined;
    const statusValue: ExpenseStatus =
      target.status &&
      (EXPENSE_STATUS as readonly string[]).includes(target.status)
        ? (target.status as ExpenseStatus)
        : 'PAGADO';

    return {
      obraId: target.obraId ?? obraId,
      frenteId: toOptionalId(target.frenteId),
      proveedorId: toOptionalId(target.proveedorId),
      proveedorName: target.proveedor?.name ?? '',
      materialId: toOptionalId(target.materialId),
      categoryId: toOptionalId(target.categoryId),
      docType,
      docSerie: target.docSerie ?? '',
      docNumero: target.docNumero ?? '',
      description: target.description ?? '',
      spentBy: normalizeSpentByInput(target.spentBy ?? '') || '',
      date: toInputDate(target.date),
      type: target.type ?? 'DIRECTO',
      variableType: target.variableType ?? 'FIJO',
      paymentMethod: target.paymentMethod ?? 'EFECTIVO',
      quantity:
        typeof target.quantity === 'number' ? String(target.quantity) : '',
      unitCost:
        typeof target.unitCost === 'number' ? String(target.unitCost) : '',
      total: totalValue !== undefined ? String(totalValue) : '',
      taxable,
      igvRate: typeof target.igvRate === 'number' ? target.igvRate : IGV_RATE_DEFAULT,
      status: statusValue,
      reminderDays:
        typeof target.reminderIntervalDays === 'number'
          ? String(target.reminderIntervalDays)
          : '',
      reminderNextDate: target.reminderNextDate ?? null,
    };
  };

  const handleEditExpense = (id: number) => {
    const target = rawExpenses.find((item) => item.id === id);
    if (!target) {
      setExpenseAlert({
        type: 'error',
        text: 'No se encontró el egreso solicitado.',
      });
      return;
    }

    setExpenseForm(mapExpenseToForm(target));
    setEditingExpenseId(id);
    setExpenseAlert(null);
  };

  const handleDeleteExpense = async (id: number) => {
    if (!ensureDeleteUnlocked()) return;
    const confirmDelete = window.confirm(
      '¿Seguro que deseas eliminar este egreso? Esta acción no se puede deshacer.',
    );
    if (!confirmDelete) return;

    setExpenseAlert(null);
    setDeletingExpenseId(id);
    try {
      await adminApi.deleteExpense(id);
      if (editingExpenseId === id) {
        resetExpenseForm();
      }
      setExpenseAlert({ type: 'success', text: 'Egreso eliminado.' });
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExpenseAlert({ type: 'error', text: msg });
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const onResetProject = async () => {
    if (resetting) return;
    if (!ensureDeleteUnlocked()) return;
    const confirmation = window.prompt(
      'Esto eliminará TODA la información del proyecto (ingresos, egresos, órdenes, etc.).\n' +
        'Escribe RESET para confirmar:',
    );
    if (!confirmation || confirmation.trim().toUpperCase() !== 'RESET') {
      setResetAlert({
        type: 'error',
        text: 'Operación cancelada. Debes escribir RESET exactamente para continuar.',
      });
      return;
    }

    setResetAlert(null);
    setResetting(true);
    try {
      const res = await adminApi.reset();
      const text = res?.message ?? 'Toda la información del proyecto fue eliminada.';
      setResetAlert({ type: 'success', text });
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setResetAlert({
        type: 'error',
        text:
          msg ||
          'No se pudo borrar la información. Intenta nuevamente o revisa la consola.',
      });
    } finally {
      setResetting(false);
    }
  };

  const onIncomeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIncomeAlert(null);

    const total = Number(incomeForm.total);
    if (!Number.isFinite(total) || total <= 0) {
      setIncomeAlert({
        type: 'error',
        text: 'Ingresa un monto total válido para el ingreso.',
      });
      return;
    }

    const taxable = incomeForm.docType === 'FACTURA' && incomeForm.taxable;
    const rate = taxable ? incomeForm.igvRate || IGV_RATE_DEFAULT : 0;
    const { base } = computeTaxParts(total, rate, taxable);

    const payload: CreateIncomePayload = {
      obraId: incomeForm.obraId,
      frenteId:
        incomeForm.frenteId === '' ? undefined : Number(incomeForm.frenteId),
      description: incomeForm.description || undefined,
      docType: incomeForm.docType,
      docSerie: incomeForm.docSerie || undefined,
      docNumero: incomeForm.docNumero || undefined,
      date: incomeForm.date || undefined,
      igvRate: taxable ? rate : 0,
      isTaxable: taxable,
      base,
    };

    try {
      setSavingIncome(true);
      if (editingIncomeId) {
        await adminApi.updateIncome(editingIncomeId, payload);
        setIncomeAlert({ type: 'success', text: 'Ingreso actualizado.' });
      } else {
        await adminApi.createIncome(payload);
        setIncomeAlert({ type: 'success', text: 'Ingreso registrado.' });
      }
      resetIncomeForm();
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setIncomeAlert({ type: 'error', text: msg });
    } finally {
      setSavingIncome(false);
    }
  };

  const onExpenseSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setExpenseAlert(null);

    const total = Number(expenseForm.total);
    if (!Number.isFinite(total) || total <= 0) {
      setExpenseAlert({
        type: 'error',
        text: 'Ingresa un monto total válido para el egreso.',
      });
      return;
    }

    const normalizedSpentBy = normalizeSpentByInput(expenseForm.spentBy);
    if (!normalizedSpentBy) {
      setExpenseAlert({
        type: 'error',
        text: 'Selecciona quién gasta antes de guardar el egreso.',
      });
      return;
    }

    const requiresDocInfo =
      !pettyCashMode && docTypeRequiresSerie(expenseForm.docType);
    const serieValue = expenseForm.docSerie.trim().toUpperCase();
    const numeroValue = expenseForm.docNumero.trim();
    if (requiresDocInfo && (!serieValue || !numeroValue)) {
      setExpenseAlert({
        type: 'error',
        text: 'Completa la serie y el número del comprobante.',
      });
      return;
    }

    const taxable = expenseForm.docType === 'FACTURA' && expenseForm.taxable;
    const rate = taxable ? expenseForm.igvRate || IGV_RATE_DEFAULT : 0;
    const { base } = computeTaxParts(total, rate, taxable);

    try {
      setSavingExpense(true);
      let proveedorIdResolved: number | undefined;
      if (expenseForm.proveedorId !== '') {
        proveedorIdResolved = Number(expenseForm.proveedorId);
      } else {
        const typedProveedor = expenseForm.proveedorName.trim();
        if (typedProveedor) {
          const existing = proveedores.find(
            (prov) =>
              prov.name.trim().localeCompare(typedProveedor, 'es', {
                sensitivity: 'base',
              }) === 0,
          );
          if (existing) {
            proveedorIdResolved = existing.id;
            setExpenseForm((prev) => ({
              ...prev,
              proveedorId: existing.id,
              proveedorName: existing.name,
            }));
          } else {
            const created = await api.post<Proveedor>('/proveedores', {
              name: typedProveedor,
            });
            proveedorIdResolved = created.id;
            setProveedores((prev) =>
              [...prev, created].sort((a, b) =>
                a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
              ),
            );
            setExpenseForm((prev) => ({
              ...prev,
              proveedorId: created.id,
              proveedorName: created.name,
            }));
          }
        }
      }

      const reminderEnabled = !!getReminderCategoryConfig(expenseForm.categoryId);
      const reminderDaysValue = reminderEnabled
        ? expenseForm.reminderDays.trim()
        : '';
      let reminderInterval: number | undefined;
      if (reminderEnabled && reminderDaysValue !== '') {
        const parsedReminder = Number(reminderDaysValue);
        if (!Number.isFinite(parsedReminder) || parsedReminder <= 0) {
          setExpenseAlert({
            type: 'error',
            text: 'Ingresa un número válido de días para el recordatorio.',
          });
          setSavingExpense(false);
          return;
        }
        reminderInterval = Math.round(parsedReminder);
      }

      const payload: CreateExpensePayload = {
        obraId: expenseForm.obraId,
        frenteId:
          expenseForm.frenteId === ''
            ? undefined
            : Number(expenseForm.frenteId),
        proveedorId: proveedorIdResolved,
        materialId:
          expenseForm.materialId === ''
            ? undefined
            : Number(expenseForm.materialId),
        categoryId:
          expenseForm.categoryId === ''
            ? undefined
            : Number(expenseForm.categoryId),
        docType: expenseForm.docType,
        docSerie: requiresDocInfo ? serieValue : undefined,
        docNumero: requiresDocInfo ? numeroValue : undefined,
        date: expenseForm.date || undefined,
        description: expenseForm.description || undefined,
        spentBy: normalizedSpentBy || undefined,
        type: expenseForm.type,
        variableType: expenseForm.variableType,
        quantity:
          expenseForm.quantity === '' ? undefined : Number(expenseForm.quantity),
        unitCost:
          expenseForm.unitCost === '' ? undefined : Number(expenseForm.unitCost),
        igvRate: taxable ? rate : 0,
        isTaxable: taxable,
        base,
        paymentMethod: expenseForm.paymentMethod,
        status: expenseForm.status || 'PAGADO',
        reminderIntervalDays: reminderInterval ?? undefined,
      };

      if (editingExpenseId) {
        const updated = await adminApi.updateExpense(editingExpenseId, payload);
        rememberProviderDefaults(updated);
        setExpenseAlert({ type: 'success', text: 'Egreso actualizado.' });
      } else {
        const created = await adminApi.createExpense(payload);
        rememberProviderDefaults(created);
        setExpenseAlert({ type: 'success', text: 'Egreso registrado.' });
      }
      resetExpenseForm();
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExpenseAlert({ type: 'error', text: msg });
    } finally {
      setSavingExpense(false);
    }
  };

  const onCreateCategory = async () => {
    const name = categoryDraft.trim();
    if (name.length < 3) {
      setCategoryAlert({
        type: 'error',
        text: 'El nombre debe tener al menos 3 caracteres.',
      });
      return;
    }
    setCategoryAlert(null);
    try {
      setAddingCategory(true);
      await adminApi.createExpenseCategory(name, categoryKind);
      setCategoryAlert({
        type: 'success',
        text: `Categoría creada como ${CATEGORY_KIND_LABEL[categoryKind]}.`,
      });
      setCategoryDraft('');
      const res = await adminApi.expenseCategories();
      setCategories(
        res.items.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setCategoryAlert({ type: 'error', text: msg });
    } finally {
      setAddingCategory(false);
    }
  };

  useEffect(() => {
    if (!incomeAlert) return;
    const t = setTimeout(() => setIncomeAlert(null), 4500);
    return () => clearTimeout(t);
  }, [incomeAlert]);

  useEffect(() => {
    if (!expenseAlert) return;
    const t = setTimeout(() => setExpenseAlert(null), 4500);
    return () => clearTimeout(t);
  }, [expenseAlert]);

  useEffect(() => {
    if (!categoryAlert) return;
    const t = setTimeout(() => setCategoryAlert(null), 4500);
    return () => clearTimeout(t);
  }, [categoryAlert]);


  const saldoColor = useMemo(
    () => (margenNeto >= 0 ? 'text-emerald-600' : 'text-rose-600'),
    [margenNeto],
  );

  return (
    <div className="admin-page">
      <div className="admin-shell">
        <header className="admin-header admin-card">
          <div className="admin-header__info">
            <h1 className="admin-title">Administración — Resumen</h1>
            <p className="admin-subtitle">
              Control centralizado de ingresos, egresos y crédito fiscal.
            </p>
          </div>
          <div className="admin-header__controls">
            <label className="admin-control">
              <span>Obra</span>
              <SearchableSelect<number>
                value={obraId}
                options={obraOptions}
                onChange={(selected, input) => {
                  if (selected !== null) {
                    setObraId(selected);
                  } else if (!input.trim() && obraOptions.length > 0) {
                    setObraId(obraOptions[0].value);
                  }
                }}
                placeholder="Selecciona la obra"
                disabled={obras.length === 0}
              />
            </label>
            <label className="admin-control">
              <span>Desde</span>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                type="date"
                className="admin-input"
              />
            </label>
            <label className="admin-control">
              <span>Hasta</span>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                type="date"
                className="admin-input"
              />
            </label>
            <label className="admin-control">
              <span>Documento</span>
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value as DocType | '')}
                className="admin-input"
              >
                <option value="">Todos</option>
                {DOC_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {pretty(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-control">
              <span>Gasto por</span>
              <select
                value={spentByFilter}
                onChange={(e) => setSpentByFilter(e.target.value)}
                className="admin-input"
              >
                <option value="">Todos</option>
                {SPENT_BY_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-header__actions">
              <button
                onClick={load}
                className="admin-button admin-button--primary"
                disabled={loading}
                type="button"
              >
                {loading ? 'Cargando…' : 'Actualizar'}
              </button>
              <button
                type="button"
                onClick={handlePrintExpenses}
                className="admin-button admin-button--ghost"
                disabled={loading || filteredExpenses.length === 0}
              >
                Imprimir reporte
              </button>
              <button
                type="button"
                onClick={onResetProject}
                className="admin-button admin-button--danger"
                disabled={resetting || !deleteUnlocked}
                title={
                  deleteUnlocked
                    ? 'Eliminar todos los registros del proyecto'
                    : 'Desbloquea en Seguridad para poder usar este botón'
                }
              >
                {resetting ? 'Reseteando…' : 'Reset'}
              </button>
            </div>
          </div>
          {resetAlert && (
            <div
              className={`admin-reset-banner admin-reset-banner--${resetAlert.type}`}
            >
              {resetAlert.text}
            </div>
          )}
        </header>

        {reminderAlerts.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            <h2 className="mb-2 text-base font-semibold">Recordatorios próximos</h2>
            <ul className="space-y-1">
              {reminderAlerts.map((alert) => {
                const dueLabel = formatDate(alert.dueDate.toISOString());
                const diff = alert.diffDays;
                let relative = '';
                if (alert.status === 'overdue') {
                  const daysLate = Math.abs(diff);
                  relative = daysLate === 1 ? 'Venció hace 1 día' : `Venció hace ${daysLate} días`;
                } else {
                  if (diff === 0) relative = 'Vence hoy';
                  else if (diff === 1) relative = 'Vence mañana';
                  else relative = `Vence en ${diff} días`;
                }
                return (
                  <li
                    key={alert.id}
                    className="flex flex-col gap-1 rounded border border-amber-200 bg-white/70 px-3 py-2 text-amber-900"
                  >
                    <div className="font-semibold">{alert.label}</div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      <span>{dueLabel}</span>
                      <span>{relative}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formularios de captura: ingresos (izquierda) y egresos (derecha) */}
        <form onSubmit={onIncomeSubmit} className="admin-card admin-form">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {editingIncomeId
                ? `Editar ingreso #${editingIncomeId}`
                : 'Registrar ingreso'}
            </h2>
            {incomeAlert && (
              <span
                className={`text-xs ${
                  incomeAlert.type === 'success'
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {incomeAlert.text}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">Obra actual: {obraActual}</p>
          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm flex flex-col gap-1">
              <span>Fecha</span>
              <input
                type="date"
                value={incomeForm.date}
                onChange={(e) =>
                  setIncomeForm((prev) => ({ ...prev, date: e.target.value }))
                }
                className="rounded border p-2 text-sm"
              />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span>Frente (opcional)</span>
              <SearchableSelect<number>
                value={incomeForm.frenteId === '' ? '' : incomeForm.frenteId}
                options={incomeFrenteOptions}
                onChange={(selected, input) => {
                  setIncomeForm((prev) => ({
                    ...prev,
                    frenteId:
                      selected !== null
                        ? selected
                        : input.trim()
                          ? prev.frenteId
                          : '',
                  }));
                }}
                placeholder="Selecciona el frente"
                className="rounded border p-2 text-sm"
              />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span>Detalle</span>
              <input
                type="text"
                value={incomeForm.description}
                onChange={(e) =>
                  setIncomeForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Ej. Valorización mensual"
                className="rounded border p-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm flex flex-col gap-1">
                <span>Tipo de documento</span>
                <SearchableSelect<DocType>
                  value={incomeForm.docType}
                  options={docTypeOptions}
                  onChange={(selected, input) => {
                    const value = selected ?? (input.toUpperCase() as DocType);
                    if (DOC_TYPES.includes(value)) {
                      setIncomeForm((prev) => ({
                        ...prev,
                        docType: value,
                        taxable:
                          value === 'FACTURA' ? prev.taxable : false,
                      }));
                    }
                  }}
                  placeholder="Tipo de documento"
                  className="rounded border p-2 text-sm"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Serie</span>
                <input
                  type="text"
                  value={incomeForm.docSerie}
                  onChange={(e) =>
                    setIncomeForm((prev) => ({
                      ...prev,
                      docSerie: e.target.value.toUpperCase(),
                    }))
                  }
                  className="rounded border p-2 text-sm uppercase"
                  maxLength={12}
                  placeholder="F001"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Número</span>
                <input
                  type="text"
                  value={incomeForm.docNumero}
                  onChange={(e) =>
                    setIncomeForm((prev) => ({
                      ...prev,
                      docNumero: e.target.value,
                    }))
                  }
                  className="rounded border p-2 text-sm"
                  maxLength={20}
                  placeholder="00012345"
                />
              </label>
            </div>
            <label className="text-sm flex flex-col gap-1">
              <span>Total (S/)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={incomeForm.total}
                onChange={(e) =>
                  setIncomeForm((prev) => ({ ...prev, total: e.target.value }))
                }
                className="rounded border p-2 text-sm"
                required
              />
            </label>
            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={
                  incomeForm.docType === 'FACTURA' && incomeForm.taxable
                }
                onChange={(e) =>
                  setIncomeForm((prev) => ({
                    ...prev,
                    taxable: e.target.checked,
                  }))
                }
                disabled={incomeForm.docType !== 'FACTURA'}
              />
              <span>Documento con IGV (crédito fiscal)</span>
            </label>
            {incomeForm.docType === 'FACTURA' && incomeForm.taxable && (
              <label className="text-sm flex flex-col gap-1">
                <span>Tasa IGV</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={incomeForm.igvRate}
                  onChange={(e) =>
                    setIncomeForm((prev) => ({
                      ...prev,
                      igvRate: Number(e.target.value) || 0,
                    }))
                  }
                  className="rounded border p-2 text-sm"
                />
                <span className="text-xs text-slate-400">
                  0.18 equivale a 18%
                </span>
              </label>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Base: {fmt(incomePreview.base || 0)}</span>
            <span>IGV: {fmt(incomePreview.igv || 0)}</span>
            <span>
              Total:{' '}
              {fmt(
                Number.isFinite(Number(incomeForm.total))
                  ? Number(incomeForm.total)
                  : 0,
              )}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              className="admin-button admin-button--primary admin-button--block"
              disabled={savingIncome}
            >
              {savingIncome
                ? 'Guardando…'
                : editingIncomeId
                  ? 'Actualizar ingreso'
                  : 'Registrar ingreso'}
            </button>
            {editingIncomeId && (
              <button
                type="button"
                onClick={resetIncomeForm}
                className="admin-button admin-button--ghost admin-button--block"
                disabled={savingIncome}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <form onSubmit={onExpenseSubmit} className="admin-card admin-form">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {editingExpenseId
                ? `Editar egreso #${editingExpenseId}`
                : 'Registrar egreso'}
            </h2>
            {expenseAlert && (
              <span
                className={`text-xs ${
                  expenseAlert.type === 'success'
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {expenseAlert.text}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Controla compras, alquileres, servicios y otros pagos.
          </p>
          <div className="rounded border border-dashed border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-slate-600 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Modo caja chica</p>
              <p>Proveedor genérico, sin serie ni IGV. Ideal para compras rápidas.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={pettyCashMode}
                onChange={(event) => setPettyCashMode(event.target.checked)}
              />
              <span>{pettyCashMode ? 'Activado' : 'Activar'}</span>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm flex flex-col gap-1">
              <span>Fecha</span>
              <input
                type="date"
                value={expenseForm.date}
                onChange={(e) =>
                  setExpenseForm((prev) => ({ ...prev, date: e.target.value }))
                }
                className="rounded border p-2 text-sm"
              />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span>Frente (opcional)</span>
              <SearchableSelect<number>
                value={expenseForm.frenteId === '' ? '' : expenseForm.frenteId}
                options={expenseFrenteOptions}
                onChange={(selected, input) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    frenteId:
                      selected !== null
                        ? selected
                        : input.trim()
                          ? prev.frenteId
                          : '',
                  }))
                }
                placeholder="Selecciona el frente"
                className="rounded border p-2 text-sm"
              />
            </label>
            <label className="text-sm flex flex-col gap-1">
              <span>Quién gasta</span>
              <SearchableSelect<string>
                value={expenseForm.spentBy === '' ? '' : expenseForm.spentBy}
                options={SPENT_BY_SELECT_OPTIONS}
                onChange={(selected) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    spentBy: selected ?? '',
                  }))
                }
                placeholder="Selecciona al responsable"
                className="rounded border p-2 text-sm"
                inputRef={spentByInputRef}
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm flex flex-col gap-1">
                <span>Proveedor</span>
                <SearchableSelect<number>
                  value={
                    expenseForm.proveedorId === ''
                      ? ''
                      : expenseForm.proveedorId
                  }
                  options={proveedorOptions}
                  onChange={(selected, input) =>
                    setExpenseForm((prev) => {
                      const option =
                        selected !== null
                          ? proveedorOptions.find((opt) => opt.value === selected)
                          : null;
                      const typed = input.trim();
                      return {
                        ...prev,
                        proveedorId: selected !== null ? selected : '',
                        proveedorName: option?.label ?? (typed ? typed : ''),
                      };
                    })
                  }
                  placeholder="Selecciona el proveedor"
                  className="rounded border p-2 text-sm"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Categoría</span>
                <SearchableSelect<number>
                  value={
                    expenseForm.categoryId === ''
                      ? ''
                      : expenseForm.categoryId
                  }
                  options={categoryOptions}
                  onChange={(selected, input) =>
                    setExpenseForm((prev) => {
                      const nextCategoryId =
                        selected !== null
                          ? selected
                          : input.trim()
                            ? prev.categoryId
                            : '';
                      const nextConfig =
                        nextCategoryId === ''
                          ? null
                          : getReminderCategoryConfig(nextCategoryId);
                      const prevConfig = getReminderCategoryConfig(prev.categoryId);
                      let nextForm: ExpenseFormState;
                      if (!nextConfig) {
                        nextForm = {
                          ...prev,
                          categoryId: nextCategoryId,
                          reminderDays: '',
                          reminderNextDate: null,
                        };
                      } else {
                        const shouldApplyDefault =
                          !prevConfig || prev.reminderDays.trim() === '';
                        const defaultDays =
                          typeof nextConfig.defaultDays === 'number'
                            ? String(nextConfig.defaultDays)
                            : '';

                        nextForm = {
                          ...prev,
                          categoryId: nextCategoryId,
                          reminderDays: shouldApplyDefault ? defaultDays : prev.reminderDays,
                          reminderNextDate: null,
                        };
                      }
                      if (selected !== null) {
                        window.requestAnimationFrame(() => {
                          expenseDescriptionRef.current?.focus();
                        });
                      }
                      return nextForm;
                    })
                  }
                  placeholder="Selecciona la categoría"
                  className="rounded border p-2 text-sm"
                />
              </label>
            </div>
            <div className="text-xs text-slate-500 space-y-2">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)_auto]">
                <input
                  type="text"
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  placeholder="Nueva categoría"
                  className="flex-1 rounded border p-2 text-sm"
                />
                <SearchableSelect<ExpenseKind>
                  value={categoryKind}
                  options={categoryKindOptions}
                  onChange={(selected, input) => {
                    if (selected !== null) {
                      setCategoryKind(selected);
                    } else if (!input.trim()) {
                      setCategoryKind('OPERATIVO');
                    }
                  }}
                  placeholder="Tipo de categoría"
                  className="rounded border p-2 text-sm"
                />
                <button
                  type="button"
                  onClick={onCreateCategory}
                  className="admin-button admin-button--ghost"
                  disabled={addingCategory || !categoryDraft.trim()}
                >
                  {addingCategory ? 'Guardando…' : 'Crear'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {categoryKindInfo.helper}
              </p>
              {categoryAlert && (
                <span
                  className={
                    categoryAlert.type === 'success'
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }
                >
                  {categoryAlert.text}
                </span>
              )}
            </div>
            <label className="text-sm flex flex-col gap-1">
              <span>Material (opcional)</span>
              <SearchableSelect<number>
                value={
                  expenseForm.materialId === ''
                    ? ''
                    : expenseForm.materialId
                }
                options={materialOptions}
                onChange={(selected, input) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    materialId:
                      selected !== null
                        ? selected
                        : input.trim()
                          ? prev.materialId
                          : '',
                  }))
                }
                placeholder="Selecciona el material"
                className="rounded border p-2 text-sm"
              />
            </label>
        <label className="text-sm flex flex-col gap-1">
          <span>Detalle / nota</span>
          <textarea
            ref={expenseDescriptionRef}
            value={expenseForm.description}
            onChange={(e) =>
              setExpenseForm((prev) => ({
                ...prev,
                description: e.target.value,
                  }))
                }
                placeholder="Ej. Compra de cemento, alquiler de maquinaria…"
                className="rounded border p-2 text-sm"
                rows={3}
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm flex flex-col gap-1">
                <span>Tipo de documento</span>
              <SearchableSelect<DocType>
                value={expenseForm.docType}
                options={docTypeOptions}
                disabled={pettyCashMode}
                onChange={(selected, input) => {
                  const value = selected ?? (input.toUpperCase() as DocType);
                  if (DOC_TYPES.includes(value)) {
                    const requiresDocs = docTypeRequiresSerie(value);
                    setExpenseForm((prev) => ({
                      ...prev,
                      docType: value,
                      taxable: value === 'FACTURA' ? prev.taxable : false,
                      docSerie: requiresDocs ? prev.docSerie : '',
                      docNumero: requiresDocs ? prev.docNumero : '',
                    }));
                  }
                  }}
                  placeholder="Tipo de documento"
                  className="rounded border p-2 text-sm"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Serie</span>
                <input
                  type="text"
                  value={expenseForm.docSerie}
                  disabled={expenseDocInputsDisabled}
                  required={!expenseDocInputsDisabled}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      docSerie: e.target.value.toUpperCase(),
                    }))
                  }
                  className="rounded border p-2 text-sm uppercase"
                  maxLength={12}
                  placeholder="F001"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Número</span>
                <input
                  type="text"
                  value={expenseForm.docNumero}
                  disabled={expenseDocInputsDisabled}
                  required={!expenseDocInputsDisabled}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      docNumero: e.target.value,
                    }))
                  }
                  className="rounded border p-2 text-sm"
                  maxLength={20}
                  placeholder="00012345"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm flex flex-col gap-1">
                <span>Cantidad</span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={expenseForm.quantity}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      quantity: e.target.value,
                    }))
                  }
                  className="rounded border p-2 text-sm"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Costo unitario (S/)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.unitCost}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      unitCost: e.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Tab' && !event.shiftKey) {
                      const next = document.querySelector('[data-focus="expense-type"]') as HTMLElement | null;
                      if (next) {
                        event.preventDefault();
                        next.focus();
                      }
                    }
                  }}
                  onBlur={() => {
                    if (
                      !expenseForm.total &&
                      suggestedExpenseTotal !== undefined
                    ) {
                      setExpenseForm((prev) => ({
                        ...prev,
                        total: suggestedExpenseTotal.toFixed(2),
                      }));
                    } else if (expenseForm.unitCost !== '') {
                      setExpenseForm((prev) => ({
                        ...prev,
                        unitCost: Number(prev.unitCost || 0).toFixed(2),
                      }));
                    }
                  }}
                  className="rounded border p-2 text-sm"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Total (S/)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.total}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      total: e.target.value,
                    }))
                  }
                  onBlur={() => {
                    if (expenseForm.total !== '') {
                      setExpenseForm((prev) => ({
                        ...prev,
                        total: Number(prev.total || 0).toFixed(2),
                      }));
                    }
                  }}
                  className="rounded border p-2 text-sm"
                  required
                />
              </label>
            </div>
            {reminderFieldVisible && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm flex flex-col gap-1">
                  <span>Recordatorio (días)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={expenseForm.reminderDays}
                    onChange={(e) =>
                      setExpenseForm((prev) => ({
                        ...prev,
                        reminderDays: e.target.value,
                        reminderNextDate: null,
                      }))
                    }
                    placeholder="Ej. 30"
                    className="rounded border p-2 text-sm"
                  />
                  {(expenseForm.reminderNextDate || reminderPreviewDate) && (
                    <span className="text-xs text-slate-500">
                      Próximo aviso:{' '}
                      {expenseForm.reminderNextDate
                        ? formatDate(expenseForm.reminderNextDate)
                        : reminderPreviewDate
                          ? formatDate(reminderPreviewDate.toISOString())
                          : ''}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    Déjalo en blanco si no necesitas recordatorio.
                  </span>
                </label>
              </div>
            )}
            {suggestedExpenseTotal !== undefined && (
              <p className="text-xs text-slate-500">
                Total sugerido: {fmt(suggestedExpenseTotal)} (cantidad × costo
                unitario)
              </p>
            )}
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    expenseForm.docType === 'FACTURA' && expenseForm.taxable
                  }
                onChange={(e) =>
                  setExpenseForm((prev) => ({
                    ...prev,
                    taxable: e.target.checked,
                    }))
                  }
                  disabled={expenseForm.docType !== 'FACTURA' || pettyCashMode}
                />
                <span>Documento con IGV (crédito fiscal)</span>
              </label>
            {expenseForm.docType === 'FACTURA' && expenseForm.taxable && !pettyCashMode && (
              <label className="text-sm flex flex-col gap-1">
                <span>Tasa IGV</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={expenseForm.igvRate}
                  onChange={(e) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      igvRate: Number(e.target.value) || 0,
                    }))
                  }
                  className="rounded border p-2 text-sm"
                />
                <span className="text-xs text-slate-400">
                  0.18 equivale a 18%
                </span>
              </label>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm flex flex-col gap-1">
                <span>Tipo de gasto</span>
                <SearchableSelect<ExpenseType>
                  value={expenseForm.type}
                  options={expenseTypeOptions}
                  data-focus="expense-type"
                  onChange={(selected, input) => {
                    const value = selected ?? (input.toUpperCase() as ExpenseType);
                    if (EXPENSE_TYPES.includes(value)) {
                      setExpenseForm((prev) => ({
                        ...prev,
                        type: value,
                      }));
                    }
                  }}
                  placeholder="Tipo de gasto"
                  className="rounded border p-2 text-sm"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Naturaleza</span>
                <SearchableSelect<VariableType>
                  value={expenseForm.variableType}
                  options={variableTypeOptions}
                  onChange={(selected, input) => {
                    const value = selected ?? (input.toUpperCase() as VariableType);
                    if (VARIABLE_TYPES.includes(value)) {
                      setExpenseForm((prev) => ({
                        ...prev,
                        variableType: value,
                      }));
                    }
                  }}
                  placeholder="Naturaleza"
                  className="rounded border p-2 text-sm"
                />
              </label>
              <label className="text-sm flex flex-col gap-1">
                <span>Método de pago</span>
                <SearchableSelect<PaymentMethod>
                  value={expenseForm.paymentMethod}
                  options={paymentMethodOptions}
                  onChange={(selected, input) => {
                    const value =
                      selected ?? (input.toUpperCase() as PaymentMethod);
                    if (PAYMENT_METHODS.includes(value)) {
                      setExpenseForm((prev) => ({
                        ...prev,
                        paymentMethod: value,
                      }));
                    }
                  }}
                  placeholder="Método de pago"
                  className="rounded border p-2 text-sm"
                />
              </label>
            </div>
            <label className="text-sm flex flex-col gap-1">
              <span>Estado</span>
              <SearchableSelect<ExpenseStatus>
                value={expenseForm.status}
                options={expenseStatusOptions}
                onChange={(selected, input) => {
                  const value =
                    selected ?? (input.toUpperCase() as ExpenseStatus);
                  if (EXPENSE_STATUS.includes(value)) {
                    setExpenseForm((prev) => ({
                      ...prev,
                      status: value,
                    }));
                  }
                }}
                placeholder="Estado"
                className="rounded border p-2 text-sm"
              />
            </label>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Base: {fmt(expensePreview.base || 0)}</span>
            <span>IGV: {fmt(expensePreview.igv || 0)}</span>
            <span>
              Total:{' '}
              {fmt(
                Number.isFinite(Number(expenseForm.total))
                  ? Number(expenseForm.total)
                  : 0,
              )}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              className="admin-button admin-button--primary admin-button--block"
              disabled={savingExpense}
            >
              {savingExpense
                ? 'Guardando…'
                : editingExpenseId
                  ? 'Actualizar egreso'
                  : 'Registrar egreso'}
            </button>
            {editingExpenseId && (
              <button
                type="button"
                onClick={resetExpenseForm}
                className="admin-button admin-button--ghost admin-button--block"
                disabled={savingExpense}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      {/* KPIs ejecutivos */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Valorizaciones" value={fmt(totales.ingresos)} hint="Ingresos facturados" />
        <KpiCard label="Costos de obra" value={fmt(totalCostos)} hint="Compras + consumo valorizado" />
        <KpiCard label="Gastos operativos" value={fmt(totalGastos)} hint="Logística, administración, servicios" />
        <KpiCard label="Margen estimado" value={fmt(margenNeto)} hint="Ingresos - Costos - Gastos" />
      </section>

      {/* Métricas generales */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="admin-card admin-card--metric">
          <p className="text-slate-500 text-sm">Panorama actual</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${saldoColor}`}>
            {fmt(margenNeto)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Costos: {fmt(totalCostos)} · Gastos: {fmt(totalGastos)}
          </p>
        </div>
        <div className="admin-card admin-card--metric">
          <p className="text-slate-500 text-sm">Crédito fiscal (IGV)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-700">
            {fmt(totales.comprasIgv)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Facturas con IGV: {totales.facturasConIgv || 0}
          </p>
          <p className="text-xs text-slate-400">
            Base: {fmt(totales.comprasBaseGravada)} · Compras: {fmt(totales.comprasTotal)}
          </p>
        </div>
      </section>

      {/* Alertas dinámicas */}
      {alerts.length > 0 && (
        <section className="admin-card admin-card--alert">
          <h2 className="font-semibold text-amber-700">Alertas</h2>
          <ul className="space-y-2 text-sm">
            {alerts.map((alert) => (
              <li
                key={`${alert.title}-${alert.detail}`}
                className={`rounded-lg border p-3 ${
                  alert.level === 'danger'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : alert.level === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                <p className="font-semibold text-sm">{alert.title}</p>
                <p className="text-xs mt-1 opacity-80">{alert.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Flujo vs top categorías */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="admin-card lg:col-span-2">
          <h2 className="font-semibold mb-3">Flujo de caja por día (14 días)</h2>
          <div className="space-y-3 max-h-72 overflow-auto pr-1 text-xs">
            {flujo.length === 0 && (
              <p className="text-sm text-slate-500">Sin datos en el rango.</p>
            )}
            {flujo.map((d) => {
              const netColor =
                d.neto >= 0 ? 'text-emerald-600' : 'text-rose-600';
              const costosDia = d.compras + d.consumo;
              const gastosDia = d.operativos;
              return (
                <div key={d.date} className="border-b last:border-b-0 pb-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-600">{d.date}</span>
                    <span className={`tabular-nums ${netColor}`}>
                      {fmt(d.neto)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1 text-[11px] text-slate-500">
                    <span>Ingresos: {fmt(d.ingresos)}</span>
                    <span>Costos de obra: {fmt(costosDia)}</span>
                    <span>Gastos operativos: {fmt(gastosDia)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-card">
          <h2 className="font-semibold mb-3">Top categorías de egresos</h2>
          {egCat.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aún no hay egresos en este rango.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {egCat.map((row) => {
                const pct =
                  totales.egresos > 0
                    ? Math.round((row.amount / totales.egresos) * 1000) / 10
                    : 0;
                return (
                  <li
                    key={`${row.category}-${row.kind}`}
                    className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-2 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="font-semibold text-slate-700">
                        {row.category}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {getKindLabel(row.kind)} · {pct.toFixed(1)}%
                      </p>
                    </div>
                    <span className="tabular-nums font-semibold text-slate-700">
                      {fmt(row.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="admin-card">
        <h2 className="font-semibold mb-3">Buscar comprobantes</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <input
            type="search"
            className="admin-input sm:flex-1"
            placeholder="Serie, número, proveedor, material o monto"
            value={expenseSearch}
            onChange={(event) => setExpenseSearch(event.target.value)}
          />
          {expenseSearch.trim() !== '' && (
            <button
              type="button"
              onClick={() => setExpenseSearch('')}
              className="admin-button admin-button--ghost"
            >
              Limpiar
            </button>
          )}
        </div>
        {expenseSearch.trim().length < 2 ? (
          <p className="text-sm text-slate-500">
            Escribe al menos 2 caracteres para buscar por documento, proveedor, material o monto.
          </p>
        ) : expenseSearchResults.length === 0 ? (
          <p className="text-sm text-slate-500">
            No se encontraron comprobantes que coincidan con tu búsqueda.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 text-sm">
            {expenseSearchResults.map((row) => (
              <li
                key={row.id}
                className="py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-700">{row.documento}</p>
                  <p className="text-slate-500">{row.proveedor}</p>
                  <p className="text-xs text-slate-400">
                    {row.fecha} · {row.categoria}
                    {row.spentBy ? ` · Gastó: ${row.spentBy}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  <span className="font-semibold text-slate-700">{row.total}</span>
                  <button
                    type="button"
                    onClick={() => handleEditExpense(row.id)}
                    className="text-xs font-semibold text-sky-600 hover:underline"
                  >
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tablas detalladas */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="admin-card">
          <h2 className="font-semibold mb-3">Valorizaciones recientes</h2>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left">Fecha</th>
                <th className="text-left">Detalle</th>
                <th className="text-right">Monto</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {incomes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-slate-500">
                    Sin valorizaciones en el rango.
                  </td>
                </tr>
              ) : (
                incomes.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td>{formatDate(r.date)}</td>
                    <td className="detail-cell">{r.description ?? r.source ?? '—'}</td>
                    <td className="text-right tabular-nums">
                      {fmt(r.total ?? 0)}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          onClick={() => handleEditIncome(r.id)}
                          className="text-sky-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteIncome(r.id)}
                          className={`text-rose-600 hover:underline disabled:opacity-60 ${!deleteUnlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={deletingIncomeId === r.id || !deleteUnlocked}
                          title={deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar'}
                        >
                          {deletingIncomeId === r.id
                            ? 'Eliminando…'
                            : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-card">
          <h2 className="font-semibold mb-3">Costos de obra</h2>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left">Fecha</th>
                <th className="text-left">Detalle</th>
                <th className="text-right">Monto</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {costoEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-slate-500">
                    Sin costos registrados en el rango.
                  </td>
                </tr>
              ) : (
                costoEntries.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td>{row.fecha}</td>
                    <td className="detail-cell">
                      <span className="detail-cell__title">{row.detalle}</span>
                      <span className="detail-cell__meta">
                        {row.categoria}
                        {row.spentBy ? ` · Gastó: ${row.spentBy}` : ''}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{row.total}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          onClick={() => handleEditExpense(row.id)}
                          className="text-sky-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(row.id)}
                          className={`text-rose-600 hover:underline disabled:opacity-60 ${!deleteUnlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={deletingExpenseId === row.id || !deleteUnlocked}
                          title={deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar'}
                        >
                          {deletingExpenseId === row.id
                            ? 'Eliminando…'
                            : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {comprasCreditoFiltered.length > 0 && (
            <div className="mt-4 border-t pt-3 text-xs text-slate-500 space-y-2">
              <p className="font-semibold text-sm text-slate-600">Crédito fiscal reciente</p>
              <ul className="space-y-1">
                {comprasCreditoFiltered.slice(0, 4).map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span>
                      {formatDate(row.date)}
                      {row.spentBy ? ` · ${row.spentBy}` : ''}
                    </span>
                    <span className="tabular-nums">{fmt(row.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="admin-card">
          <h2 className="font-semibold mb-3">Gastos operativos</h2>
          <table className="w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left">Fecha</th>
                <th className="text-left">Detalle</th>
                <th className="text-right">Monto</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastoEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-slate-500">
                    Sin gastos operativos en el rango.
                  </td>
                </tr>
              ) : (
                gastoEntries.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td>{row.fecha}</td>
                    <td className="detail-cell">
                      <span className="detail-cell__title">{row.detalle}</span>
                      <span className="detail-cell__meta">
                        {row.categoria}
                        {row.spentBy ? ` · Gastó: ${row.spentBy}` : ''}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{row.total}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          onClick={() => handleEditExpense(row.id)}
                          className="text-sky-600 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(row.id)}
                          className={`text-rose-600 hover:underline disabled:opacity-60 ${!deleteUnlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={deletingExpenseId === row.id || !deleteUnlocked}
                          title={deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar'}
                        >
                          {deletingExpenseId === row.id
                            ? 'Eliminando…'
                            : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
  );
}
