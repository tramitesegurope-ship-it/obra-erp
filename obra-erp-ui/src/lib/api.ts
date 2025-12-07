import { getDeletePassword, lockDelete } from './deleteAuth';
import type {
  AttendanceRecord,
  AttendanceStatus,
  DailyCashRendition,
  DocType,
  Employee,
  ExpenseCategory,
  ExpenseKind,
  ExpenseType,
  FoodCostLineType,
  FoodCostPeriod,
  FoodCostPool,
  FoodCostPoolType,
  PoolAllocationMethod,
  FoodIngredientListItem,
  FoodMealPlanDetail,
  FoodMealPlanListItem,
  FoodMealPlanSummary,
  FoodMealType,
  FoodRecipeDetail,
  FoodRecipeListItem,
  PaymentMethod,
  PayrollAdjustment,
  PayrollAdjustmentType,
  PayrollEntry,
  PayrollPeriod,
  PayrollPeriodStatus,
  Partner,
  PartnerLoan,
  PartnerLoanStatus,
  PartnerLoanSummary,
  QuotationProcessListItem,
  QuotationProcessSummary,
  RecipeCostSummary,
  VariableType,
  PurchaseOrderLogEntry,
  PurchaseDeliveryLogEntry,
} from './types';

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const toUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith('/') ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
};

async function request<T = unknown>(method: Method, path: string, data?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const opts: RequestInit = { method, headers };
  if (method === 'DELETE') {
    const password = getDeletePassword();
    if (!password) {
      throw new Error('Las eliminaciones están bloqueadas. Ve a Seguridad y desbloquea con tu contraseña.');
    }
    headers['X-Admin-Delete-Password'] = password;
    const payload = data && typeof data === 'object' ? { ...(data as Record<string, unknown>) } : {};
    payload.adminPassword = password;
    opts.body = JSON.stringify(payload);
  } else if (data !== undefined && method !== 'GET') {
    opts.body = JSON.stringify(data);
  }

  const res = await fetch(toUrl(path), opts);
  if (!res.ok) {
    if (method === 'DELETE' && res.status === 403) {
      lockDelete();
    }
    const msg = await res.text().catch(() => '');
    throw new Error(msg || res.statusText);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function requestForm<T = unknown>(method: Method, path: string, form: FormData): Promise<T> {
  const res = await fetch(toUrl(path), { method, body: form });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || res.statusText);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const http = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, data?: unknown) => request<T>('POST', path, data),
  put: <T = unknown>(path: string, data?: unknown) => request<T>('PUT', path, data),
  patch: <T = unknown>(path: string, data?: unknown) => request<T>('PATCH', path, data),
  delete: <T = unknown>(path: string) => request<T>('DELETE', path),
  postForm: <T = unknown>(path: string, form: FormData) => requestForm<T>('POST', path, form),
};

export default http;
export { API_BASE, request };

export type AdminSummaryResponse = {
  totales: {
    ingresos: number;
    egresosCompras: number;
    egresosConsumo: number;
    egresosOperativos: number;
    egresos: number;
    margen: number;
    margenPct: number;
    operativosPct: number;
    comprasBaseGravada: number;
    comprasIgv: number;
    comprasTotal: number;
    facturasConIgv: number;
  };
  egresosPorCategoria: { category: string; kind: ExpenseKind; amount: number }[];
  flujo: {
    date: string;
    ingresos: number;
    compras: number;
    consumo: number;
    operativos: number;
    egresos: number;
    neto: number;
  }[];
  alerts: { level: 'info' | 'warn' | 'danger'; title: string; detail: string }[];
};

export type AdminIncomeRow = {
  id: number;
  obraId?: number | null;
  frenteId?: number | null;
  date: string;
  description?: string | null;
  docType?: DocType | null;
  docSerie?: string | null;
  docNumero?: string | null;
  igvRate?: number | null;
  isTaxable?: boolean | null;
  base?: number | null;
  igv?: number | null;
  total?: number | null;
  source?: string | null;
};

export type AdminExpenseRow = {
  id: number;
  obraId?: number | null;
  frenteId?: number | null;
  proveedorId?: number | null;
  materialId?: number | null;
  categoryId?: number | null;
  date: string;
  description?: string | null;
  spentBy?: string | null;
  docType?: DocType | null;
  docSerie?: string | null;
  docNumero?: string | null;
  base?: number | null;
  igv?: number | null;
  total?: number | null;
  isTaxable?: boolean | null;
  igvRate?: number | null;
  type?: ExpenseType | null;
  variableType?: VariableType | null;
  quantity?: number | null;
  unitCost?: number | null;
  paymentMethod?: PaymentMethod | null;
  paidAt?: string | null;
  status?: string | null;
  reminderIntervalDays?: number | null;
  reminderNextDate?: string | null;
  proveedor?: { name?: string | null } | null;
  category?: { name?: string | null; kind?: ExpenseKind | null } | null;
  material?: { name?: string | null } | null;
};

export type CreateIncomePayload = {
  obraId: number;
  frenteId?: number | null;
  date?: string;
  description?: string | null;
  docType?: DocType;
  docSerie?: string | null;
  docNumero?: string | null;
  igvRate?: number;
  isTaxable?: boolean;
  base: number;
};

export type CreateExpensePayload = {
  obraId: number;
  frenteId?: number | null;
  proveedorId?: number | null;
  materialId?: number | null;
  categoryId?: number | null;
  docType?: DocType;
  docSerie?: string | null;
  docNumero?: string | null;
  date?: string;
  description?: string | null;
  spentBy?: string | null;
  type?: ExpenseType;
  variableType?: VariableType;
  quantity?: number;
  unitCost?: number;
  igvRate?: number;
  isTaxable?: boolean;
  base: number;
  paymentMethod?: PaymentMethod;
  paidAt?: string | null;
  status?: string;
  reminderIntervalDays?: number | null;
};

export type FinanceBudgetResponse = {
  summary: {
    groups: Array<{
      group: string;
      count: number;
      contractual: number;
      metrado: number;
      additions: number;
      newItems: number;
      deductions: number;
      binding: number;
    }>;
    overall: {
      count: number;
      contractual: number;
      metrado: number;
      additions: number;
      newItems: number;
      deductions: number;
      binding: number;
    };
  };
  items: Array<{
    group: string;
    code?: string | null;
    description: string;
    unit?: string | null;
    qtyContractual?: number | null;
    qtyMetrado?: number | null;
    additions?: { quantity?: number | null; total?: number | null } | null;
    newItems?: { quantity?: number | null; total?: number | null } | null;
    deductions?: { quantity?: number | null; total?: number | null } | null;
    bindingDeduction?: { quantity?: number | null; total?: number | null } | null;
    components?: Array<{ description: string; quantity?: number | null; unit?: string | null }> | null;
  }>;
};

export type FinancePerformanceResponse = {
  generatedAt: string;
  overall: {
    executedQty: number;
    totalReal: number;
    totalBudget: number;
    coverage: number | null;
    variance: number | null;
    byCategory: Record<string, number>;
  };
  items: Array<{
    group: string;
    code?: string | null;
    description: string;
    unit?: string | null;
    sheetName?: string | null;
    budgetQty?: number | null;
    executedQty?: number | null;
    coverage?: number | null;
    plannedQty?: number | null;
    puBudget?: number | null;
    puReal?: number | null;
    totalBudget?: number | null;
    totalReal?: number | null;
    variance?: number | null;
    status: string;
    costBreakdown: Record<string, number>;
  }>;
  tramoSummary: Array<{ tramo: string; executedQty: number; totalReal: number; puReal: number | null }>;
};

export const financeApi = {
  getBudget: (group?: string) =>
    http.get<FinanceBudgetResponse>(
      group ? `/finance/budget?group=${encodeURIComponent(group)}` : '/finance/budget',
    ),
  getDailyCosts: () =>
    http.get<{
      generatedAt: string;
      entries: Array<{
        date: string;
        group: string;
        code?: string | null;
        description: string;
        executedQty?: number | null;
        materialsCost?: number;
        laborCost?: number;
        indirectFixed?: number;
        indirectVariable?: number;
        totalCost?: number;
      }>;
    }>('/finance/costs/daily'),
  getPerformance: () => http.get<FinancePerformanceResponse>('/finance/performance'),
};

export type UpdateIncomePayload = CreateIncomePayload;
export type UpdateExpensePayload = CreateExpensePayload;
export type DailyCashPayload = {
  date?: string;
  obraId?: number | null;
  openingBalance?: number;
  received: number;
  personalContribution?: number;
  expenses: Array<{
    description: string;
    amount: number;
    personalAmount?: number;
    paidWithPersonal?: boolean;
  }>;
  notes?: string | null;
};

export type ImportBaselineResponse = {
  processId: number;
  baselineCount: number;
  totals: { totalQuantity: number; totalCost: number };
  baseCurrency: string;
};

export type ImportSupplierResponse = {
  quotationId: number;
  importedItems: number;
  matchedItems: number;
  unmatchedItems: number;
  totals: {
    currency: string;
    amount: number;
    baseCurrency: string;
    normalizedAmount: number;
  };
  rawSummary: { count: number; total: number };
  mode?: 'CREATED' | 'UPDATED';
};

export const listQuotationProcesses = () =>
  http.get<QuotationProcessListItem[]>('/quotations/processes');

export const fetchQuotationSummary = (processId: number) =>
  http.get<QuotationProcessSummary>(`/quotations/processes/${processId}/summary`);

export type PurchaseOrderHistoryResponse = {
  orders: PurchaseOrderLogEntry[];
  nextSequence: number;
  nextOrderNumber: string;
};

export const fetchPurchaseOrders = (processId: number) =>
  http.get<PurchaseOrderHistoryResponse>(`/quotations/processes/${processId}/purchase-orders`);

export type SavePurchaseOrderPayload = {
  quotationId?: number;
  supplierId?: number;
  supplierName?: string;
  orderNumber?: string;
  issueDate?: string;
  currency?: string;
  totals?: {
    subtotal?: number;
    discount?: number;
    netSubtotal?: number;
    igv?: number;
    total?: number;
    discountRate?: number;
  };
  snapshot?: Record<string, unknown>;
  lines?: Array<{
    baselineId?: number;
    description: string;
    unit?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
  }>;
};

export const savePurchaseOrder = (processId: number, payload: SavePurchaseOrderPayload) =>
  http.post<{ order: PurchaseOrderLogEntry; nextSequence: number; nextOrderNumber: string }>(
    `/quotations/processes/${processId}/purchase-orders`,
    payload,
  );

export const updatePurchaseOrder = (processId: number, orderId: number, payload: SavePurchaseOrderPayload) =>
  http.put<{ order: PurchaseOrderLogEntry }>(
    `/quotations/processes/${processId}/purchase-orders/${orderId}`,
    payload,
  );

export const deleteSupplierQuote = (quotationId: number, options?: { force?: boolean }) => {
  const query = options?.force ? '?force=1' : '';
  return http.delete<{ ok: boolean }>(`/quotations/${quotationId}${query}`);
};

export type PurchaseProgressResponse = {
  items: Array<{
    key?: string;
    baselineId: number | null;
    baselineIds?: number[];
    description: string;
    unit?: string | null;
    sheetName?: string | null;
    sheetNames?: string[] | null;
    sectionPath?: string | null;
    required: number;
    ordered: number;
    received: number;
    orderPct: number;
    receivePct: number;
    pendingOrder: number;
    pendingReceive: number;
  }>;
};

export const fetchPurchaseProgress = (processId: number) =>
  http.get<PurchaseProgressResponse>(`/quotations/processes/${processId}/purchase-progress`);

export type PurchaseDeliveryForm = {
  orderId?: number;
  proveedorId?: number;
  supplierName?: string;
  guideNumber?: string;
  date?: string;
  notes?: string;
  items: Array<{
    baselineId?: number;
    orderLineId?: number;
    description: string;
    unit?: string;
    quantity: number;
    notes?: string;
  }>;
};

export const fetchPurchaseDeliveries = (processId: number) =>
  http.get<{ items: PurchaseDeliveryLogEntry[] }>(`/quotations/processes/${processId}/deliveries`);

export const savePurchaseDelivery = (processId: number, payload: PurchaseDeliveryForm) =>
  http.post(`/quotations/processes/${processId}/deliveries`, payload);

export const uploadQuotationBase = (form: FormData) =>
  http.postForm<ImportBaselineResponse>('/quotations/processes/import-base', form);

export const uploadSupplierQuote = (processId: number, form: FormData) =>
  http.postForm<ImportSupplierResponse>(`/quotations/processes/${processId}/import`, form);

export const resetQuotationProcess = (processId: number) =>
  http.post<{ ok: boolean }>(`/quotations/processes/${processId}/reset`);

export type ManualQuotePayload = {
  baselineId: number;
  unitPrice?: number;
  quantity?: number;
  totalPrice?: number;
  currency?: string;
};

export const upsertQuotationManualItem = (quotationId: number, payload: ManualQuotePayload) =>
  http.post(`/quotations/${quotationId}/manual-item`, payload);

export type PartnerLoanCreatePayload = {
  date?: string;
  giverId: number;
  receiverId: number;
  amount: number;
  note?: string | null;
};
export type PartnerLoanUpdatePayload = {
  status?: PartnerLoanStatus;
  note?: string | null;
  financeRefs?: string[];
};

const resetProject = () =>
  request<{ ok: boolean; message: string }>('POST', '/admin/reset-demo');

export const adminApi = {
  summary: (obraId: number, from?: string, to?: string) => {
    const params = new URLSearchParams({ obraId: String(obraId) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request<AdminSummaryResponse>('GET', `/admin/summary?${params.toString()}`);
  },
  incomes: (obraId: number, from?: string, to?: string) => {
    const params = new URLSearchParams({ obraId: String(obraId) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return request<{ items: AdminIncomeRow[] }>('GET', `/admin/incomes?${params.toString()}`);
  },
  expenses: (
    obraId: number,
    from?: string,
    to?: string,
    docType?: DocType,
    extras?: { proveedorId?: number; limit?: number; spentBy?: string },
  ) => {
    const params = new URLSearchParams({ obraId: String(obraId) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (docType) params.set('docType', docType);
    if (extras?.proveedorId) params.set('proveedorId', String(extras.proveedorId));
    if (extras?.limit) params.set('limit', String(extras.limit));
    if (extras?.spentBy) params.set('spentBy', extras.spentBy);
    return request<{ items: AdminExpenseRow[] }>('GET', `/admin/expenses?${params.toString()}`);
  },
  createIncome: (payload: CreateIncomePayload) =>
    request<AdminIncomeRow>('POST', '/admin/incomes', payload),
  updateIncome: (id: number, payload: UpdateIncomePayload) =>
    request<AdminIncomeRow>('PUT', `/admin/incomes/${id}`, payload),
  deleteIncome: (id: number) => request<void>('DELETE', `/admin/incomes/${id}`),
  createExpense: (payload: CreateExpensePayload) =>
    request<AdminExpenseRow>('POST', '/admin/expenses', payload),
  updateExpense: (id: number, payload: UpdateExpensePayload) =>
    request<AdminExpenseRow>('PUT', `/admin/expenses/${id}`, payload),
  deleteExpense: (id: number) => request<void>('DELETE', `/admin/expenses/${id}`),
  expenseCategories: () =>
    request<{ items: ExpenseCategory[] }>('GET', '/admin/expense-categories'),
  createExpenseCategory: (name: string, kind: ExpenseKind) =>
    request<ExpenseCategory>('POST', '/admin/expense-categories', { name, kind }),
  resetDemo: () =>
    resetProject(),
  reset: () => resetProject(),
  dailyCash: {
    list: (filters: { obraId?: number; from?: string; to?: string } = {}) => {
      const params = new URLSearchParams();
      if (filters.obraId) params.set('obraId', String(filters.obraId));
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const query = params.toString();
      return request<{ items: DailyCashRendition[] }>(
        'GET',
        `/admin/daily-cash${query ? `?${query}` : ''}`,
      );
    },
    create: (payload: DailyCashPayload) =>
      request<DailyCashRendition>('POST', '/admin/daily-cash', payload),
    remove: (id: number) => request<void>('DELETE', `/admin/daily-cash/${id}`),
  },
};

export const partnerApi = {
  partners: {
    list: () => request<{ items: Partner[] }>('GET', '/partners/internal'),
    create: (payload: { name: string }) =>
      request<Partner>('POST', '/partners/internal', payload),
    update: (id: number, payload: { name: string }) =>
      request<Partner>('PATCH', `/partners/internal/${id}`, payload),
  },
  loans: {
    list: (filters: { status?: PartnerLoanStatus; from?: string; to?: string } = {}) => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const query = params.toString();
      return request<{ items: PartnerLoan[]; summary: PartnerLoanSummary }>(
        'GET',
        `/partners/internal/loans${query ? `?${query}` : ''}`,
      );
    },
    create: (payload: PartnerLoanCreatePayload) =>
      request<PartnerLoan>('POST', '/partners/internal/loans', payload),
    update: (id: number, payload: PartnerLoanUpdatePayload) =>
      request<PartnerLoan>('PATCH', `/partners/internal/loans/${id}`, payload),
  },
};

export type EmployeePayload = {
  code?: string | null;
  firstName: string;
  lastName: string;
  documentType?: string | null;
  documentNumber?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  bankType?: 'BCP' | 'INTERBANK' | 'SCOTIABANK' | 'BANCO_NACION' | 'YAPE_PLIN' | 'OTROS' | null;
  accountNumber?: string | null;
  cci?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  baseSalary: number;
  dailyHours?: number | null;
  pensionSystem?: string | null;
  pensionRate?: number | null;
  healthRate?: number | null;
  obraId?: number | null;
  notes?: string | null;
  isActive?: boolean;
  absenceSundayPenalty?: boolean;
  area?: 'OPERATIVE' | 'ADMINISTRATIVE';
};

export type AttendancePayload = {
  employeeId: number;
  date: string;
  status: AttendanceStatus;
  minutesLate?: number;
  permissionHours?: number;
  extraHours?: number;
  permissionPaid?: boolean;
  holidayWorked?: boolean;
  holidayCount?: number;
  notes?: string | null;
};

export type AdjustmentPayload = {
  type: PayrollAdjustmentType;
  concept: string;
  amount: number;
};

export const personnelApi = {
  employees: {
    list: (filters: { obraId?: number; active?: boolean; area?: 'OPERATIVE' | 'ADMINISTRATIVE' } = {}) => {
      const params = new URLSearchParams();
      if (filters.obraId) params.set('obraId', String(filters.obraId));
      if (filters.active !== undefined) params.set('active', String(filters.active));
      if (filters.area) params.set('area', filters.area);
      const query = params.toString();
      return request<{ items: Employee[] }>(
        'GET',
        `/personnel/employees${query ? `?${query}` : ''}`,
      );
    },
    create: (payload: EmployeePayload) =>
      request<Employee>('POST', '/personnel/employees', payload),
    update: (id: number, payload: Partial<EmployeePayload>) =>
      request<Employee>('PATCH', `/personnel/employees/${id}`, payload),
    get: (id: number) =>
      request<Employee>('GET', `/personnel/employees/${id}`),
    delete: (id: number) =>
      request<{ ok: boolean }>('DELETE', `/personnel/employees/${id}`),
  },
  attendance: {
    list: (filters: { employeeId?: number; obraId?: number; from?: string; to?: string } = {}) => {
      const params = new URLSearchParams();
      if (filters.employeeId) params.set('employeeId', String(filters.employeeId));
      if (filters.obraId) params.set('obraId', String(filters.obraId));
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const query = params.toString();
      return request<{ items: AttendanceRecord[] }>(
        'GET',
        `/personnel/attendance${query ? `?${query}` : ''}`,
      );
    },
    upsert: (payload: AttendancePayload) =>
      request<AttendanceRecord>('POST', '/personnel/attendance', payload),
    update: (id: number, payload: Partial<AttendancePayload>) =>
      request<AttendanceRecord>('PATCH', `/personnel/attendance/${id}`, payload),
    remove: (id: number) =>
      request<{ ok: boolean }>('DELETE', `/personnel/attendance/${id}`),
    stats: (obraId: number, from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const query = params.toString();
      return request<{ obraId: number; stats: Record<AttendanceStatus, number> }>(
        'GET',
        `/personnel/attendance/statistics/${obraId}${query ? `?${query}` : ''}`,
      );
    },
  },
  periods: {
    create: (payload: { month: number; year: number; obraId?: number | null; workingDays?: number; notes?: string | null }) =>
      request<PayrollPeriod>('POST', '/personnel/periods', payload),
    list: (filters: { obraId?: number; status?: PayrollPeriodStatus } = {}) => {
      const params = new URLSearchParams();
      if (filters.obraId) params.set('obraId', String(filters.obraId));
      if (filters.status) params.set('status', filters.status);
      const query = params.toString();
      return request<{ items: PayrollPeriod[] }>(
        'GET',
        `/personnel/periods${query ? `?${query}` : ''}`,
      );
    },
    get: (id: number) =>
      request<PayrollPeriod & { entries: PayrollEntry[] }>('GET', `/personnel/periods/${id}`),
    update: (id: number, payload: Partial<{ month: number; year: number; obraId?: number | null; workingDays?: number; notes?: string | null; status?: PayrollPeriodStatus }>) =>
      request<PayrollPeriod>('PATCH', `/personnel/periods/${id}`, payload),
    generate: (id: number, recalcClosed?: boolean) =>
      request<{ ok: boolean; result: { periodId: number; totals: { neto: number; planilla: number; empleados: number } } }>(
        'POST',
        `/personnel/periods/${id}/generate`,
        recalcClosed ? { recalcClosed } : {},
      ),
    close: (id: number) =>
      request<PayrollPeriod>('POST', `/personnel/periods/${id}/close`),
  },
  entries: {
    get: (id: number) =>
      request<PayrollEntry & { adjustments: PayrollAdjustment[] }>(
        'GET',
        `/personnel/entries/${id}`,
      ),
    addAdjustment: (id: number, payload: AdjustmentPayload) =>
      request<PayrollEntry & { adjustments: PayrollAdjustment[] }>(
        'POST',
        `/personnel/entries/${id}/adjustments`,
        payload,
      ),
    deleteAdjustment: (id: number) =>
      request<PayrollEntry & { adjustments: PayrollAdjustment[] }>(
        'DELETE',
        `/personnel/adjustments/${id}`,
      ),
  },
  accumulationPayments: {
    list: () =>
      request<{ items: Array<{ employeeId: number; paid: boolean; paidAt: string | null }> }>(
        'GET',
        '/personnel/accumulation-payments',
      ),
    update: (employeeId: number, payload: { paid: boolean; adminPassword?: string }) =>
      request<{ employeeId: number; paid: boolean; paidAt: string | null }>(
        'PATCH',
        `/personnel/employees/${employeeId}/accumulation-payment`,
        payload,
      ),
  },
};

type IngredientPayload = {
  name: string;
  category?: string | null;
  unit?: string | null;
  defaultWastePct?: number;
  notes?: string | null;
};

type IngredientCostPayload = {
  unitCost: number;
  effectiveDate?: string | null;
  source?: string | null;
};

type RecipeItemPayload = {
  ingredientId?: number;
  childRecipeId?: number;
  quantity: number;
  unit?: string | null;
  wastePct?: number | null;
  notes?: string | null;
};

type ExtraCostPayload = {
  label: string;
  amount: number;
  costType?: FoodCostLineType;
  period?: FoodCostPeriod;
  periodRations?: number | null;
  notes?: string | null;
};

type RecipePayload = {
  name: string;
  code?: string | null;
  mealType: FoodMealType;
  yield: number;
  yieldUnit?: string | null;
  notes?: string | null;
  items: RecipeItemPayload[];
  extraCosts?: ExtraCostPayload[];
  prepMinutes?: number | null;
  dailyBlocks?: number | null;
};

type CostPoolPayload = {
  name: string;
  type?: FoodCostPoolType;
  amount: number;
  period: FoodCostPeriod;
  periodRations?: number | null;
  appliesTo?: FoodMealType | null;
  allocationMethod?: PoolAllocationMethod;
  dailyBlocks?: number | null;
  timeMinutes?: number | null;
  notes?: string | null;
};

type MealPlanEntryPayload = {
  dayIndex: number;
  mealType: FoodMealType;
  recipeId: number;
  servings: number;
  notes?: string | null;
};

type MealPlanPayload = {
  name: string;
  weekStart?: string | null;
  notes?: string | null;
  entries: MealPlanEntryPayload[];
};

export const foodApi = {
  ingredients: {
    list: () => request<{ items: FoodIngredientListItem[] }>('GET', '/food/ingredients'),
    importDefaults: () => request<{ inserted: number }>('POST', '/food/ingredients/import-defaults'),
    create: (payload: IngredientPayload) =>
      request<FoodIngredientListItem>('POST', '/food/ingredients', payload),
    update: (id: number, payload: Partial<IngredientPayload>) =>
      request<FoodIngredientListItem>('PATCH', `/food/ingredients/${id}`, payload),
    addCost: (id: number, payload: IngredientCostPayload) =>
      request('POST', `/food/ingredients/${id}/costs`, payload),
  },
  recipes: {
    list: () => request<{ items: FoodRecipeListItem[] }>('GET', '/food/recipes'),
    get: (id: number) => request<FoodRecipeDetail>('GET', `/food/recipes/${id}`),
    create: (payload: RecipePayload) => request<FoodRecipeDetail>('POST', '/food/recipes', payload),
    update: (id: number, payload: Partial<RecipePayload>) =>
      request<FoodRecipeDetail>('PATCH', `/food/recipes/${id}`, payload),
    cost: (id: number) => request<RecipeCostSummary>('GET', `/food/recipes/${id}/cost`),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/food/recipes/${id}`),
  },
  pools: {
    list: () => request<{ items: FoodCostPool[] }>('GET', '/food/cost-pools'),
    create: (payload: CostPoolPayload) =>
      request<FoodCostPool>('POST', '/food/cost-pools', payload),
    update: (id: number, payload: Partial<CostPoolPayload>) =>
      request<FoodCostPool>('PATCH', `/food/cost-pools/${id}`, payload),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/food/cost-pools/${id}`),
  },
  mealPlans: {
    list: () => request<{ items: FoodMealPlanListItem[] }>('GET', '/food/meal-plans'),
    create: (payload: MealPlanPayload) => request<FoodMealPlanDetail>('POST', '/food/meal-plans', payload),
    update: (id: number, payload: MealPlanPayload) => request<FoodMealPlanDetail>('PUT', `/food/meal-plans/${id}`, payload),
    get: (id: number) => request<FoodMealPlanDetail>('GET', `/food/meal-plans/${id}`),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/food/meal-plans/${id}`),
    duplicate: (id: number, payload?: { name?: string; weekStart?: string | null }) =>
      request<FoodMealPlanDetail>('POST', `/food/meal-plans/${id}/duplicate`, payload ?? {}),
    summary: (id: number) => request<FoodMealPlanSummary>('GET', `/food/meal-plans/${id}/summary`),
  },
};
