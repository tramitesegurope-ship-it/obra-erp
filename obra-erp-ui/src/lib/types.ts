export type MoveType = 'IN' | 'OUT';
export type DocType = 'FACTURA' | 'BOLETA' | 'RECIBO' | 'OTRO';
export type ExpenseType = 'DIRECTO' | 'INDIRECTO';
export type VariableType = 'FIJO' | 'VARIABLE';
export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'YAPE' | 'PLIN' | 'OTRO';
export type ExpenseKind =
  | 'OPERATIVO'
  | 'ADMINISTRATIVO'
  | 'MATERIAL_COMPRA'
  | 'MATERIAL_CONSUMO'
  | 'FINANCIERO'
  | 'OTROS';

export type DocumentType = 'DNI' | 'CE' | 'PASS' | 'OTRO';
export type PensionSystem = 'NINGUNO' | 'ONP' | 'AFP' | 'SNP' | 'EXONERADO';
export type AttendanceStatus = 'PRESENT' | 'TARDY' | 'ABSENT' | 'PERMISSION';
export type PayrollPeriodStatus = 'OPEN' | 'PROCESSED' | 'CLOSED';
export type PayrollAdjustmentType = 'BONUS' | 'DEDUCTION' | 'ADVANCE';
export type AssetStatus = 'IN_WAREHOUSE' | 'OUT_ON_FIELD';
export type PartnerLoanStatus = 'PENDING' | 'RENDIDO' | 'DEVUELTO';
export type EmployeeArea = 'OPERATIVE' | 'ADMINISTRATIVE';

export interface Obra { id: number; name: string; }
export interface Material {
  id: number;
  name: string;
  code?: string | null;
  unit?: string | null;
  groupId?: number | null;
  group?: MaterialGroup | null;
  minStock?: number;
  reorderQuantity?: number;
  allowNegative?: boolean;
  isCompanyAsset?: boolean;
  assetStatus?: AssetStatus;
  assetResponsible?: string | null;
}
export interface MaterialGroup {
  id: number;
  name: string;
  parentId?: number | null;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
export interface Proveedor { id: number; name: string; }
export interface Frente { id: number; name: string; obraId: number; }
export interface ExpenseCategory { id: number; name: string; kind: ExpenseKind; }

export interface Move {
  id: number;
  obraId: number;
  frenteId?: number | null;
  materialId: number;
  proveedorId?: number | null;
  type: MoveType;
  quantity: number;
  unitCost?: number | null;
  date?: string;
  note?: string | null;
  totalCost?: number | null;
  docType?: DocType | null;
  docSerie?: string | null;
  docNumero?: string | null;
  igvRate?: number | null;
  isTaxable?: boolean | null;
  responsible?: string | null;
  assetStatus?: AssetStatus | null;
}

export interface MoveCreate {
  obraId: number;
  frenteId?: number | null;
  materialId: number;
  proveedorId?: number | null;
  type: MoveType;
  quantity: number;
  unitCost?: number | null;
  date?: string | null;
  note?: string | null;
  docType?: DocType | null;
  docSerie?: string | null;
  docNumero?: string | null;
  isTaxable?: boolean;
  igvRate?: number;
  responsible?: string | null;
}

export interface MoveCreated extends Move {
  balanceAfter?: number;
}

export interface Employee {
  id: number;
  code?: string | null;
  firstName: string;
  lastName: string;
  documentType?: DocumentType | null;
  documentNumber?: string | null;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  bankType?: string | null;
  accountNumber?: string | null;
  cci?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  baseSalary: number;
  dailyHours?: number | null;
  pensionSystem?: PensionSystem | null;
  pensionRate?: number | null;
  healthRate?: number | null;
  isActive: boolean;
  area?: EmployeeArea | null;
  obraId?: number | null;
  notes?: string | null;
  absenceSundayPenalty?: boolean | null;
}

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  status: AttendanceStatus;
  minutesLate?: number | null;
  permissionHours?: number | null;
  extraHours?: number | null;
  permissionPaid?: boolean | null;
  holidayWorked?: boolean | null;
  holidayCount?: number | null;
  notes?: string | null;
  employee?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'position' | 'obraId'>;
}

export interface PayrollPeriod {
  id: number;
  obraId?: number | null;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  workingDays: number;
  status: PayrollPeriodStatus;
  notes?: string | null;
}

export interface Partner {
  id: number;
  name: string;
}

export interface PartnerLoan {
  id: number;
  date: string;
  giver: Partner;
  receiver: Partner;
  amount: number;
  note?: string | null;
  status: PartnerLoanStatus;
  financeRefs: string[];
  closeDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerLoanSummary {
  pendingByReceiver: Array<{ partnerId: number; partnerName: string; pendingAmount: number }>;
}

export interface DailyCashRendition {
  id: number;
  date: string;
  obraId?: number | null;
  openingBalance?: number | null;
  received: number;
  spent: number;
  personalContribution?: number | null;
  balance: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  expenses?: DailyCashExpense[];
  pendingReimbursement?: number;
}

export interface DailyCashExpense {
  id: number;
  description: string;
  amount: number;
  personalAmount?: number | null;
  paidWithPersonal: boolean;
  createdAt: string;
}

export interface PayrollAdjustment {
  id: number;
  entryId: number;
  type: PayrollAdjustmentType;
  concept: string;
  amount: number;
}

export interface PayrollEntryDetails {
  attendance?: {
    totalRecords: number;
    workedDays: number;
    absenceDays: number;
    recordedAbsenceDays?: number;
    absencePenaltyDays?: number;
    penaltyWeeks?: number;
    sundayPenaltyApplied?: boolean;
    tardinessMinutes: number;
    permissionDays: number;
    permissionHours: number;
    overtimeHours: number;
    holidayDays: number;
    eligibleDays?: number;
    periodDays?: number;
    startDate?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    weekendSundayDays?: number;
  };
  breakdown?: {
    baseSalary: number;
    dailyRate: number;
    hourlyRate: number;
    overtimeBonus: number;
    holidayBonus: number;
    manualBonuses: number;
    manualDeductions: number;
    manualAdvances?: number;
    absenceDeduction: number;
    absencePenaltyDays?: number;
    tardinessDeduction: number;
    permissionDeduction: number;
    monthlyBase?: number;
    eligibleDays?: number;
    periodDays?: number;
    weekendSundayBonus?: number;
  };
  pension?: {
    system?: PensionSystem | null;
    rate: number;
    amount: number;
  };
  health?: {
    rate: number;
    amount: number;
  };
}

export interface PayrollEntry {
  id: number;
  periodId: number;
  employeeId: number;
  baseSalary: number;
  dailyRate: number;
  hourlyRate: number;
  workedDays: number;
  absenceDays: number;
  tardinessMinutes: number;
  permissionHours: number;
  overtimeHours: number;
  bonusesTotal: number;
  deductionsTotal: number;
  pensionAmount: number;
  healthAmount: number;
  grossEarnings: number;
  netPay: number;
  permissionDays: number;
  holidayDays: number;
  holidayBonus: number;
  details?: PayrollEntryDetails | null;
  employee?: Employee;
  adjustments?: PayrollAdjustment[];
}

export type QuotationProcessStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type QuotationStatus = 'DRAFT' | 'RECEIVED' | 'SHORTLISTED' | 'AWARDED' | 'DISCARDED';

export interface QuotationProcessListItem {
  id: number;
  name: string;
  code?: string | null;
  status: QuotationProcessStatus;
  baseCurrency: string;
  exchangeRate?: number | null;
  baselineItems: number;
  quotations: number;
  createdAt: string;
}

export interface QuotationOfferRow {
  quotationId: number;
  supplier: string;
  unitPrice?: number | null;
  normalizedPrice?: number | null;
  totalPrice?: number | null;
  quantity?: number | null;
  currency: string;
  matchScore?: number | null;
  rowOrder?: number | null;
  offeredDescription?: string | null;
}

export interface QuotationMaterialComparisonRow {
  baselineId: number;
  itemCode?: string | null;
  description: string;
  sheetName: string;
  sectionPath: string[];
  unit?: string | null;
  baseUnitPrice?: number | null;
  baseTotalPrice?: number | null;
  baseQuantity?: number | null;
  offers: QuotationOfferRow[];
  bestOffer: QuotationOfferRow | null;
}

export interface QuotationSectionSummary {
  sheetName: string;
  sectionPath: string[];
  baseTotal: number;
  suppliers: Array<{ quotationId: number; supplier: string; total: number }>;
}

export interface QuotationSheetSummary {
  sheetName: string;
  baseTotal: number;
  suppliers: Array<{ quotationId: number; supplier: string; total: number }>;
}

export interface QuotationRankingRow {
  quotationId: number;
  supplier: string;
  currency: string;
  totalAmount?: number | null;
  normalizedAmount?: number | null;
  itemsMatched: number;
  missing: number;
  coveragePct?: number | null;
  diffAmount?: number | null;
  diffPct?: number | null;
  status: QuotationStatus | string;
}

export interface QuotationProcessSummary {
  process: {
    id: number;
    name: string;
    code?: string | null;
    status: QuotationProcessStatus;
    baseCurrency: string;
    exchangeRate?: number | null;
    targetMarginPct?: number | null;
    notes?: string | null;
    createdAt: string;
    baselineCount: number;
    quotationCount: number;
  };
  baselineTotals: { quantity: number; cost: number };
  materialComparison: QuotationMaterialComparisonRow[];
  rankings: QuotationRankingRow[];
  winnerId?: number | null;
  sectionSummaries: QuotationSectionSummary[];
  sheetSummaries: QuotationSheetSummary[];
  quotations: Array<{
    id: number;
    supplier: string;
    currency: string;
    items: Array<{
      id: number;
      baselineId?: number | null;
      description: string;
      offeredDescription?: string | null;
      sheetName?: string | null;
      unit?: string | null;
      originalUnit?: string | null;
      quantity?: number | null;
      unitPrice?: number | null;
      totalPrice?: number | null;
      rowOrder?: number | null;
      itemCode?: string | null;
    }>;
  }>;
}

export type PurchaseOrderPreviewItem = {
  id: string;
  baselineId?: number;
  description: string;
  unit?: string | null;
  quantity: number | null;
  unitPrice: number | null;
  itemCode?: string | null;
  autoLinked?: boolean;
  supplierRowOrder?: number | null;
  providerDescription?: string | null;
};

export type PurchaseOrderFormData = {
  orderNumber: string;
  issueDate: string;
  attention: string;
  motive: string;
  supplierDisplayName: string;
  invoiceName: string;
  invoiceAddress: string;
  invoiceRuc: string;
  scope: string;
  signatureName: string;
  signatureTitle: string;
  showManualSignature: boolean;
};

export type PurchaseOrderSignatureImage = {
  id: string;
  src: string;
  name?: string;
  offsetX?: number;
  offsetY?: number;
};

export interface PurchaseOrderLogEntry {
  id: number;
  processId: number;
  quotationId?: number | null;
  supplierId?: number | null;
  supplierName: string;
  orderNumber: string;
  sequence: number;
  issueDate: string;
  currency: string;
  subtotal?: number | null;
  discount?: number | null;
  netSubtotal?: number | null;
  igv?: number | null;
  total?: number | null;
  createdAt: string;
  snapshot?: {
    form?: PurchaseOrderFormData;
    items?: PurchaseOrderPreviewItem[];
    meta?: {
      igvRate?: number;
      discountPct?: number;
    };
  } | null;
  lines?: Array<{
    id?: number;
    baselineId?: number | null;
    description: string;
    unit?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    metadata?: Record<string, unknown> | null;
  }>;
}

export interface PurchaseDeliveryLogEntry {
  id: number;
  processId: number;
  orderId?: number | null;
  orderNumber?: string | null;
  supplierName: string;
  guideNumber?: string | null;
  date: string;
  notes?: string | null;
  items: Array<{
    id: number;
    baselineId?: number | null;
    description: string;
    unit?: string | null;
    quantity?: number | null;
    notes?: string | null;
  }>;
}

export type FoodMealType = 'DESAYUNO' | 'ALMUERZO' | 'CENA' | 'REFRIGERIO' | 'COMPONENTE';
export type FoodCostPeriod = 'POR_RACION' | 'POR_SERVICIO' | 'DIARIO' | 'SEMANAL' | 'MENSUAL';
export type FoodCostPoolType =
  | 'MANO_OBRA'
  | 'ALQUILER'
  | 'SERVICIOS_BASICOS'
  | 'LOGISTICA'
  | 'TRANSPORTE'
  | 'COMBUSTIBLE'
  | 'SUMINISTROS'
  | 'OTROS';
export type FoodCostLineType = 'MANO_OBRA' | 'INDIRECTO' | 'TRANSPORTE' | 'LOGISTICA' | 'SUMINISTROS' | 'OTROS';

export interface FoodIngredientListItem {
  id: number;
  name: string;
  category?: string | null;
  unit?: string | null;
  defaultWastePct?: number | null;
  notes?: string | null;
  latestCost?: number | null;
  latestCostDate?: string | null;
}

export interface FoodRecipeListItem {
  id: number;
  name: string;
  code?: string | null;
  mealType: FoodMealType;
  yield: number;
  yieldUnit?: string | null;
  isActive: boolean;
  notes?: string | null;
  _count?: { items: number };
}

export interface FoodRecipeItemDetail {
  id: number;
  ingredientId?: number | null;
  childRecipeId?: number | null;
  quantity: number;
  unit?: string | null;
  wastePct?: number | null;
  notes?: string | null;
  ingredient?: FoodIngredientListItem | null;
  childRecipe?: Pick<FoodRecipeListItem, 'id' | 'name' | 'mealType' | 'yield' | 'yieldUnit'> | null;
}

export interface FoodRecipeExtraCost {
  id: number;
  label: string;
  amount: number;
  costType: FoodCostLineType;
  period: FoodCostPeriod;
  periodRations?: number | null;
  notes?: string | null;
}

export interface FoodRecipeDetail extends FoodRecipeListItem {
  items: FoodRecipeItemDetail[];
  extraCosts: FoodRecipeExtraCost[];
  prepMinutes?: number | null;
  dailyBlocks?: number | null;
}

export type PoolAllocationMethod = 'RACIONES' | 'BLOQUES' | 'MINUTOS';

export interface FoodCostPool {
  id: number;
  name: string;
  type: FoodCostPoolType;
  amount: number;
  period: FoodCostPeriod;
  periodRations?: number | null;
  appliesTo?: FoodMealType | null;
  allocationMethod?: PoolAllocationMethod;
  dailyBlocks?: number | null;
  timeMinutes?: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecipeCostSummary {
  recipe: {
    id: number;
    name: string;
    mealType: FoodMealType;
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
  ingredients: Array<{
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
  }>;
  components: Array<{
    itemId: number;
    recipeId: number;
    name: string;
    quantity: number;
    unit?: string | null;
    batchCost: number;
    perPortion: number;
  }>;
  extras: Array<{
    id: number;
    label: string;
    period: FoodCostPeriod;
    amount: number;
    periodRations?: number | null;
    totalCost: number;
    perPortion: number;
  }>;
  pools: Array<{
    id: number;
    name: string;
    type: FoodCostPoolType;
    period: FoodCostPeriod;
    amount: number;
    periodRations?: number | null;
    totalCost: number;
    perPortion: number;
  }>;
}

export type FoodMealPlanListItem = {
  id: number;
  name: string;
  weekStart?: string | null;
  notes?: string | null;
  totalEntries: number;
  totalServings: number;
};

export type FoodMealPlanEntryDetail = {
  id: number;
  dayIndex: number;
  mealType: FoodMealType;
  recipeId: number;
  recipeName: string | null;
  servings: number;
  notes?: string | null;
};

export type FoodMealPlanDetail = {
  id: number;
  name: string;
  weekStart?: string | null;
  notes?: string | null;
  entries: FoodMealPlanEntryDetail[];
};

export type FoodMealPlanSummary = {
  plan: {
    id: number;
    name: string;
    weekStart?: string | null;
    notes?: string | null;
  };
  totals: {
    entries: number;
    servings: number;
    ingredientCost: number;
    otherCost: number;
    totalCost: number;
    perServing: number | null;
    uniqueRecipes: number;
  };
  ingredients: Array<{
    ingredientId: number | null;
    name: string;
    unit?: string | null;
    quantity: number;
    netQuantity: number;
    unitCost: number;
    subtotal: number;
  }>;
  entries: Array<{
    dayIndex: number;
    mealType: FoodMealType;
    recipeId: number;
    recipeName: string;
    servings: number;
    cost: number;
  }>;
};
