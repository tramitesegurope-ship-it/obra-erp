import { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import type { FormEvent } from 'react';
import PurchaseOrderPreview from '../components/PurchaseOrderPreview';
import {
  fetchQuotationSummary,
  listQuotationProcesses,
  uploadQuotationBase,
  uploadSupplierQuote,
  deleteSupplierQuote,
  fetchPurchaseOrders,
  savePurchaseOrder,
  updatePurchaseOrder,
  fetchPurchaseProgress,
  fetchPurchaseDeliveries,
  savePurchaseDelivery,
} from '../lib/api';
import type { PurchaseProgressResponse } from '../lib/api';
import type {
  QuotationMaterialComparisonRow,
  QuotationProcessListItem,
  QuotationProcessSummary,
  QuotationOfferRow,
  PurchaseOrderLogEntry,
  PurchaseDeliveryLogEntry,
  PurchaseOrderFormData,
  PurchaseOrderPreviewItem,
  PurchaseOrderSignatureImage,
} from '../lib/types';

const PURCHASE_LOGO_STORAGE_KEY = 'obra-erp.purchaseOrderLogo';
const PURCHASE_SIGNATURE_IMAGE_KEY = 'obra-erp.purchaseSignatureImage';
const PURCHASE_MOTIVES_KEY = 'obra-erp.purchaseMotives';
const LEGACY_SIGNATURE_LEFT_KEY = 'obra-erp.purchaseSignatureLeft';
const LEGACY_SIGNATURE_RIGHT_KEY = 'obra-erp.purchaseSignatureRight';

const todayInputDate = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const formatMoney = (value?: number | null, currency?: string) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const formatted = value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
};

const formatPercentDetailed = (value?: number | null, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
};

const formatPercentCompact = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const scaled = value * 100;
  if (!Number.isFinite(scaled)) return '—';
  if (Number.isInteger(scaled)) return `${scaled.toFixed(0)}%`;
  return `${scaled.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
};

const clamp01 = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
};
const PROGRESS_EPSILON = 0.0001;

const formatShortDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatQuantity = (value: number, unit?: string | null) => {
  const formatted = value.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
};

const normalizeSupplierKey = (value?: string | null) => {
  if (!value) return 'PROVEEDOR';
  return value.trim().toUpperCase();
};

const extractBaseSupplierLabel = (label?: string | null) => {
  if (!label) return 'Proveedor';
  const delimiterIdx = label.indexOf(' - ');
  if (delimiterIdx >= 0) {
    return label.slice(0, delimiterIdx).trim();
  }
  return label.trim();
};

const computeOfferTotal = (offer: QuotationOfferRow, fallbackQuantity?: number | null) => {
  if (offer.totalPrice !== undefined && offer.totalPrice !== null) return offer.totalPrice;
  const qty = offer.quantity ?? fallbackQuantity ?? null;
  if (qty && offer.unitPrice) return qty * offer.unitPrice;
  return null;
};

type PurchaseOrderItem = PurchaseOrderPreviewItem & { autoLinked?: boolean };
type SupplierQuoteItem = QuotationProcessSummary['quotations'][number]['items'][number];

type PurchaseOrderDraft = {
  processId: number;
  form: PurchaseOrderFormData;
  items: PurchaseOrderItem[];
  igvRate: number;
  discountPct: number;
  supplierInput: string;
  supplierId: number | null;
};

type PurchaseDeliveryItemDraft = {
  id: string;
  baselineId?: number;
  description: string;
  unit?: string | null;
  quantity: number;
  notes?: string;
};

type PurchaseDeliveryDraft = {
  guideNumber: string;
  date: string;
  supplierName: string;
  notes: string;
  items: PurchaseDeliveryItemDraft[];
  orderId: number | null;
};

const PURCHASE_DRAFT_KEY = 'obra-erp.purchaseOrderDraft';
const DELIVERY_DRAFT_KEY = 'obra-erp.purchaseDeliveryDraft';
const MAX_SIGNATURE_IMAGES = 3;

const toSafeNumber = (value?: number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
};

const normalizeItemCode = (value?: string | number | null) => {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) {
    return Number(numeric.toFixed(2)).toString();
  }
  return raw;
};

const defaultPurchaseForm = (): PurchaseOrderFormData => ({
  orderNumber: '',
  issueDate: todayInputDate(),
  attention: '',
  motive: 'Ampliación del Servicio de Energía Eléctrica en la\nprovincia de Santa, distrito de Pamparomas – departamento de Ancash',
  supplierDisplayName: '',
  invoiceName: 'CONSORCIO PACÍFICO',
  invoiceAddress: 'Calle la Cultura, manzana C, lote N° 16, Asociación San Juan Masías, San Borja, Lima',
  invoiceRuc: '20611482796',
  scope: 'Se detalla la presente orden para la provisión de materiales adjudicados.',
  signatureName: 'JAIME SALAZAR ESPINOZA',
  signatureTitle: 'GERENTE ADMINISTRATIVO',
  showManualSignature: true,
});

const loadPurchaseDraft = (): PurchaseOrderDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PURCHASE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PurchaseOrderDraft & { discountPct?: number };
    if (parsed && typeof parsed === 'object' && typeof parsed.processId === 'number') {
      return {
        ...parsed,
        discountPct: typeof parsed.discountPct === 'number' ? parsed.discountPct : 0,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
};

const persistPurchaseDraft = (draft: PurchaseOrderDraft) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PURCHASE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
};

const clearPurchaseDraft = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PURCHASE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
};

const defaultDeliveryDraft = (supplierName?: string, orderId?: number | null): PurchaseDeliveryDraft => ({
  guideNumber: '',
  date: todayInputDate(),
  supplierName: supplierName?.trim() || '',
  notes: '',
  items: [],
  orderId: orderId ?? null,
});

const loadDeliveryDraft = (): { processId: number; draft: PurchaseDeliveryDraft } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DELIVERY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.processId === 'number' && parsed.draft) {
      return parsed as { processId: number; draft: PurchaseDeliveryDraft };
    }
  } catch {
    /* ignore */
  }
  return null;
};

const persistDeliveryDraft = (payload: { processId: number; draft: PurchaseDeliveryDraft }) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DELIVERY_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
};

const clearDeliveryDraft = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DELIVERY_DRAFT_KEY);
  } catch {
    /* ignore */
  }
};

const generateItemId = () => `po-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
const generateSignatureId = () => `sig-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

export default function QuotationsPage() {
  const [processes, setProcesses] = useState<QuotationProcessListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<QuotationProcessSummary | null>(null);
  const summaryProcessId = summary?.process.id ?? null;
  const [listLoading, setListLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [baseForm, setBaseForm] = useState({
    name: '',
    code: '',
    baseCurrency: 'PEN',
    exchangeRate: '',
    targetMarginPct: '',
    notes: '',
    file: null as File | null,
  });
  const [supplierForm, setSupplierForm] = useState({
    supplierName: '',
    label: '',
    currency: 'PEN',
    exchangeRate: '',
    notes: '',
    file: null as File | null,
    targetQuotationId: '',
  });
  const [baseStatus, setBaseStatus] = useState<{ loading: boolean; message?: string; error?: string }>({ loading: false });
  const [supplierStatus, setSupplierStatus] = useState<{ loading: boolean; message?: string; error?: string }>({ loading: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [baseFileKey, setBaseFileKey] = useState(0);
  const [supplierFileKey, setSupplierFileKey] = useState(0);
const [selectedSupplierKeys, setSelectedSupplierKeys] = useState<string[]>([]);
const [coverageSearch, setCoverageSearch] = useState('');
const [coverageStatusFilter, setCoverageStatusFilter] = useState<'ALL' | 'FULL' | 'PENDING'>('ALL');
const [progressSearch, setProgressSearch] = useState('');
const [progressStatusFilter, setProgressStatusFilter] = useState<'ALL' | 'PENDING' | 'R0_25' | 'R25_50' | 'R50_75' | 'R75_99' | 'R100'>('ALL');
const [deliveryHistorySearch, setDeliveryHistorySearch] = useState('');
const [supplierDeleteId, setSupplierDeleteId] = useState<number | null>(null);
const [deliveryAutoFillEnabled, setDeliveryAutoFillEnabled] = useState(true);
  const [selectedSheet, setSelectedSheet] = useState<'ALL' | string>('ALL');
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | null>(null);
  const [purchaseItemsState, setPurchaseItemsState] = useState<PurchaseOrderItem[]>([]);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseOrderFormData>(() => defaultPurchaseForm());
  const [purchaseIgvRate, setPurchaseIgvRate] = useState(0.18);
  const [purchaseDiscountPct, setPurchaseDiscountPct] = useState(0);
  const [purchaseItemQuery, setPurchaseItemQuery] = useState('');
  const [purchaseLogo, setPurchaseLogo] = useState<{ src: string; name: string } | null>(null);
  const [purchaseLogoError, setPurchaseLogoError] = useState<string | null>(null);
  const supplierInputListId = useId();
  const deliveryBaselineListId = useId();
const [purchaseSupplierInput, setPurchaseSupplierInput] = useState('');
const [signatureImages, setSignatureImages] = useState<PurchaseOrderSignatureImage[]>([]);
const [signatureError, setSignatureError] = useState<string | null>(null);
const [savedMotives, setSavedMotives] = useState<string[]>([]);
const [sortBySupplierOrder, setSortBySupplierOrder] = useState(false);
const [supplierSheetFilter, setSupplierSheetFilter] = useState<'ALL' | string>('ALL');
const previousSupplierIdRef = useRef<number | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseOrderLogEntry[]>([]);
  const [purchaseHistoryLoading, setPurchaseHistoryLoading] = useState(false);
const [purchaseHistoryError, setPurchaseHistoryError] = useState<string | null>(null);
const [nextOrderNumber, setNextOrderNumber] = useState('001/CP');
const [orderNumberTouched, setOrderNumberTouched] = useState(false);
const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
const [purchaseSaveStatus, setPurchaseSaveStatus] = useState<{ loading: boolean; error: string | null; message: string | null }>({
  loading: false,
  error: null,
  message: null,
});
const [purchaseProgress, setPurchaseProgress] = useState<PurchaseProgressResponse['items']>([]);
const [progressLoading, setProgressLoading] = useState(false);
const [progressError, setProgressError] = useState<string | null>(null);
  const [deliveryDraft, setDeliveryDraft] = useState<PurchaseDeliveryDraft>(() => defaultDeliveryDraft());
const [deliveryStatus, setDeliveryStatus] = useState<{ loading: boolean; error?: string | null; message?: string | null }>({
  loading: false,
  error: null,
  message: null,
});
const [deliveryHistory, setDeliveryHistory] = useState<PurchaseDeliveryLogEntry[]>([]);
const [deliveryHistoryLoading, setDeliveryHistoryLoading] = useState(false);
const [deliveryHistoryError, setDeliveryHistoryError] = useState<string | null>(null);
const [deliveryMode, setDeliveryMode] = useState<'ORDER' | 'MANUAL'>('ORDER');
const [deliveryItemQuery, setDeliveryItemQuery] = useState('');
const [operationsTab, setOperationsTab] = useState<'ORDER' | 'DELIVERY'>('ORDER');
const [mainTab, setMainTab] = useState<'COMPARE' | 'ANALYSIS' | 'OPS'>('COMPARE');

  const sortPurchaseItems = useCallback(
    (items: PurchaseOrderItem[]) => {
      if (!sortBySupplierOrder) {
        return Array.isArray(items) ? [...items] : items;
      }
      return [...items].sort((a, b) => {
        const orderA = a.supplierRowOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.supplierRowOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.description.localeCompare(b.description);
      });
    },
    [sortBySupplierOrder],
  );

  const setPurchaseItems = useCallback(
    (updater: React.SetStateAction<PurchaseOrderItem[]>) => {
      setPurchaseItemsState(prev => {
        const next =
          typeof updater === 'function'
            ? (updater as (current: PurchaseOrderItem[]) => PurchaseOrderItem[])(prev)
            : updater;
        return sortPurchaseItems(next);
      });
    },
    [sortPurchaseItems],
  );

  const purchaseItems = purchaseItemsState;

  const supplierQuoteItems = useMemo(() => {
    if (!summary || !purchaseSupplierId) {
      return [] as QuotationProcessSummary['quotations'][number]['items'];
    }
    const quote = summary.quotations?.find(item => item.id === purchaseSupplierId);
    if (!quote) return [] as QuotationProcessSummary['quotations'][number]['items'];
    return quote.items;
  }, [summary, purchaseSupplierId]);
  const supplierOfferDescriptions = useMemo(() => {
    const map = new Map<number, string>();
    supplierQuoteItems.forEach(item => {
      if (item.baselineId && item.offeredDescription) {
        map.set(item.baselineId, item.offeredDescription);
      }
    });
    return map;
  }, [supplierQuoteItems]);
  const supplierSheetNames = useMemo(() => {
    if (!supplierQuoteItems.length) return [] as string[];
    const labels = new Set<string>();
    supplierQuoteItems.forEach(item => {
      const label = (item.sheetName?.trim() || 'Hoja');
      labels.add(label);
    });
    return Array.from(labels);
  }, [supplierQuoteItems]);
  const filteredSupplierQuoteItems = useMemo(() => {
    if (supplierSheetFilter === 'ALL') {
      return supplierQuoteItems;
    }
    return supplierQuoteItems.filter(item => (item.sheetName?.trim() || 'Hoja') === supplierSheetFilter);
  }, [supplierQuoteItems, supplierSheetFilter]);

  const baselineMap = useMemo(() => {
    const map = new Map<number, QuotationMaterialComparisonRow>();
    if (!summary) return map;
    summary.materialComparison.forEach(item => {
      if (typeof item.baselineId === 'number') {
        map.set(item.baselineId, item);
      }
    });
    return map;
  }, [summary]);

  const baselineOptions = useMemo(() => Array.from(baselineMap.values()), [baselineMap]);
  const baselineDescriptionMap = useMemo(() => {
    const map = new Map<string, QuotationMaterialComparisonRow>();
    baselineOptions.forEach(option => {
      const key = option.description.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, option);
      }
    });
    return map;
  }, [baselineOptions]);

  const deliveryItemSuggestions = useMemo(() => {
    const term = deliveryItemQuery.trim().toLowerCase();
    if (term.length < 2) return [];
    const taken = new Set(
      deliveryDraft.items
        .map(item => item.baselineId)
        .filter((id): id is number => typeof id === 'number'),
    );
    return baselineOptions
      .filter(option => {
        if (taken.has(option.baselineId)) return false;
        const description = option.description.toLowerCase();
        const code = normalizeItemCode(option.itemCode)?.toLowerCase() ?? '';
        return description.includes(term) || (!!code && code.includes(term));
      })
      .slice(0, 6);
  }, [baselineOptions, deliveryDraft.items, deliveryItemQuery]);

  const purchaseProgressSorted = useMemo(() => {
    if (!purchaseProgress.length) return [];
    return [...purchaseProgress].sort(
      (a, b) =>
        (Number(b.pendingOrder) || 0) + (Number(b.pendingReceive) || 0) - ((Number(a.pendingOrder) || 0) + (Number(a.pendingReceive) || 0)),
    );
  }, [purchaseProgress]);

  const purchaseProgressDerived = useMemo(() => {
    return purchaseProgressSorted.map(item => {
      const required = Number(item.required) || 0;
      const ordered = Number(item.ordered) || 0;
      const received = Number(item.received) || 0;
      const pendingOrderRaw = typeof item.pendingOrder === 'number' ? item.pendingOrder : Number(item.pendingOrder);
      const pendingReceiveRaw = typeof item.pendingReceive === 'number' ? item.pendingReceive : Number(item.pendingReceive);
      const fallbackOrderPending = required ? Math.max(required - ordered, 0) : 0;
      const fallbackReceivePending = required ? Math.max(required - received, 0) : 0;
      const validOrder = Number.isFinite(pendingOrderRaw) ? pendingOrderRaw : fallbackOrderPending;
      const validReceive = Number.isFinite(pendingReceiveRaw) ? pendingReceiveRaw : fallbackReceivePending;
      const orderPendingDiff = Math.abs(fallbackOrderPending - validOrder);
      const receivePendingDiff = Math.abs(fallbackReceivePending - validReceive);
      const computedPendingOrder = orderPendingDiff > PROGRESS_EPSILON ? fallbackOrderPending : validOrder;
      const computedPendingReceive = receivePendingDiff > PROGRESS_EPSILON ? fallbackReceivePending : validReceive;
      const fallbackOrderPct = required ? ordered / required : 0;
      const fallbackReceivePct = required ? received / required : 0;
      const rawOrderPct = clamp01(item.orderPct ?? fallbackOrderPct);
      const rawReceivePct = clamp01(item.receivePct ?? fallbackReceivePct);
      const orderPctDiff = Math.abs(rawOrderPct - fallbackOrderPct);
      const receivePctDiff = Math.abs(rawReceivePct - fallbackReceivePct);
      const computedOrderPct = orderPctDiff > PROGRESS_EPSILON ? fallbackOrderPct : rawOrderPct;
      const computedReceivePct = receivePctDiff > PROGRESS_EPSILON ? fallbackReceivePct : rawReceivePct;
      const hasOrderActivity = ordered > 0 || computedOrderPct > 0;
      const hasReceiveActivity = received > 0 || computedReceivePct > 0;
      const completeByOrder = hasOrderActivity && (computedPendingOrder <= PROGRESS_EPSILON || computedOrderPct >= 0.999);
      const completeByReceive = hasReceiveActivity && (computedPendingReceive <= PROGRESS_EPSILON || computedReceivePct >= 0.999);
      const computedComplete = completeByOrder || completeByReceive;
      return {
        ...item,
        computedPendingOrder,
        computedPendingReceive,
        computedOrderPct,
        computedReceivePct,
        computedComplete,
      };
    });
  }, [purchaseProgressSorted]);


  const purchaseProgressStats = useMemo(() => {
    if (!purchaseProgress.length) return null;
    const totalItems = purchaseProgress.length;
    if (!totalItems) return null;
    let orderedFraction = 0;
    let receivedFraction = 0;
    let itemsWithOrder = 0;
    let itemsReceived = 0;
    purchaseProgress.forEach(item => {
      const required = Number(item.required) || 0;
      const orderRatio = required ? (Number(item.ordered) || 0) / required : item.orderPct ?? 0;
      const receiveRatio = required ? (Number(item.received) || 0) / required : item.receivePct ?? 0;
      const orderPct = clamp01(item.orderPct ?? orderRatio);
      const receivePct = clamp01(item.receivePct ?? receiveRatio);
      orderedFraction += orderPct;
      receivedFraction += receivePct;
      if (orderPct > 0) itemsWithOrder += 1;
      if (receivePct > 0) itemsReceived += 1;
    });
    return {
      totalItems,
      itemsWithOrder,
      itemsReceived,
      orderedPct: orderedFraction / totalItems,
      receivedPct: receivedFraction / totalItems,
    };
  }, [purchaseProgress, summary]);

  const deliveryHistoryFiltered = useMemo(() => {
    const term = deliveryHistorySearch.trim().toLowerCase();
    if (!term) return deliveryHistory;
    return deliveryHistory.filter(entry => {
      const tokens = [
        entry.guideNumber,
        entry.supplierName,
        entry.orderNumber,
        entry.items.map(item => item.description).join(' '),
      ];
      return tokens.some(token => token && token.toLowerCase().includes(term));
    });
  }, [deliveryHistory, deliveryHistorySearch]);
  const purchaseProgressFiltered = useMemo(() => {
    const term = progressSearch.trim().toLowerCase();
    return purchaseProgressDerived.filter(item => {
      const sheetLabel = item.sheetNames?.length ? item.sheetNames.join(' / ') : item.sheetName ?? '';
      const baselineTokens =
        item.baselineIds?.flatMap(baselineId => {
          const baseline = baselineMap.get(baselineId);
          if (!baseline) return [];
          const normalizedCode = baseline.itemCode ? normalizeItemCode(baseline.itemCode)?.toLowerCase() ?? '' : '';
          return [
            baseline.description,
            baseline.sheetName,
            baseline.sectionPath?.join(' '),
            normalizedCode,
            String(baseline.baselineId ?? baselineId),
          ].filter(Boolean);
        }) ?? [];
      const tokens = [
        item.description,
        item.sectionPath,
        sheetLabel,
        item.key,
        ...(item.baselineIds?.map(id => String(id)) ?? []),
        ...baselineTokens,
      ];
      const matchesTerm = term ? tokens.some(token => token && token.toLowerCase().includes(term)) : true;
      const isComplete = item.computedComplete;
      const displayPct = Math.max(item.computedReceivePct ?? 0, item.computedOrderPct ?? 0);
      let matchesStatus = true;
      if (progressStatusFilter === 'PENDING') {
        matchesStatus = !isComplete;
      } else if (progressStatusFilter !== 'ALL') {
        const ranges: Record<string, [number, number]> = {
          R0_25: [0.01, 0.25],
          R25_50: [0.25, 0.5],
          R50_75: [0.5, 0.75],
          R75_99: [0.75, 0.99],
          R100: [0.99, 1.01],
        };
        const currentRange = ranges[progressStatusFilter];
        if (currentRange) {
          matchesStatus = displayPct >= currentRange[0] - PROGRESS_EPSILON && displayPct < currentRange[1] + PROGRESS_EPSILON;
          if (progressStatusFilter === 'R100') {
            matchesStatus = isComplete;
          }
        }
      }
      return matchesTerm && matchesStatus;
    });
  }, [baselineMap, progressSearch, progressStatusFilter, purchaseProgressDerived]);

  

  const refreshPurchaseProgress = useCallback(async () => {
    if (!summaryProcessId) {
      setPurchaseProgress([]);
      return;
    }
    setProgressLoading(true);
    setProgressError(null);
    try {
      const data = await fetchPurchaseProgress(summaryProcessId);
      setPurchaseProgress(data.items);
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : 'No se pudo calcular el avance de compras.');
      setPurchaseProgress([]);
    } finally {
      setProgressLoading(false);
    }
  }, [summaryProcessId]);

  const loadDeliveries = useCallback(async () => {
    if (!summaryProcessId) {
      setDeliveryHistory([]);
      return;
    }
    setDeliveryHistoryLoading(true);
    setDeliveryHistoryError(null);
    try {
      const data = await fetchPurchaseDeliveries(summaryProcessId);
      setDeliveryHistory(data.items);
    } catch (err) {
      setDeliveryHistoryError(err instanceof Error ? err.message : 'No se pudo cargar las guías.');
      setDeliveryHistory([]);
    } finally {
      setDeliveryHistoryLoading(false);
    }
  }, [summaryProcessId]);

  useEffect(() => {
    if (purchaseSupplierId !== previousSupplierIdRef.current) {
      previousSupplierIdRef.current = purchaseSupplierId;
      if (!purchaseSupplierId || !supplierSheetNames.length) {
        setSupplierSheetFilter('ALL');
        return;
      }
      const preferred =
        supplierSheetNames.find(name => name.toLowerCase().includes('ferreter')) || supplierSheetNames[0];
      setSupplierSheetFilter(preferred ?? 'ALL');
    }
  }, [purchaseSupplierId, supplierSheetNames]);

  useEffect(() => {
    if (supplierSheetFilter === 'ALL') {
      if (!supplierSheetNames.length && purchaseSupplierId) {
        setSupplierSheetFilter('ALL');
      }
      return;
    }
    if (!supplierSheetNames.length) {
      setSupplierSheetFilter('ALL');
      return;
    }
    if (!supplierSheetNames.includes(supplierSheetFilter)) {
      setSupplierSheetFilter(supplierSheetNames[0] ?? 'ALL');
    }
  }, [supplierSheetFilter, supplierSheetNames, purchaseSupplierId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(PURCHASE_LOGO_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.src) {
          setPurchaseLogo(parsed);
        }
      }
    } catch {
      /* ignore logo restoration errors */
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(PURCHASE_MOTIVES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const motives = parsed
            .map(value => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean);
          if (motives.length) {
            setSavedMotives(motives);
          }
        }
      }
    } catch {
      /* ignore motive restoration errors */
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(PURCHASE_SIGNATURE_IMAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map(item => {
              if (!item?.src) return null;
              return {
                id: item.id ?? generateSignatureId(),
                src: item.src as string,
                name: item.name ?? 'firma.png',
                offsetX: item.offsetX ?? 0,
                offsetY: item.offsetY ?? 0,
              } as PurchaseOrderSignatureImage;
            })
            .filter(Boolean) as PurchaseOrderSignatureImage[];
          if (normalized.length) {
            setSignatureImages(normalized.slice(0, 5));
            return;
          }
        } else if (parsed?.src) {
          setSignatureImages([
            {
              id: generateSignatureId(),
              src: parsed.src,
              name: parsed.name ?? 'firma.png',
              offsetX: parsed.offsetX ?? 0,
              offsetY: parsed.offsetY ?? 0,
            },
          ]);
          return;
        }
      }
      const legacy =
        window.localStorage.getItem(LEGACY_SIGNATURE_RIGHT_KEY) ??
        window.localStorage.getItem(LEGACY_SIGNATURE_LEFT_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (parsedLegacy?.src) {
          const payload: PurchaseOrderSignatureImage = {
            id: generateSignatureId(),
            src: parsedLegacy.src,
            name: parsedLegacy.name ?? 'firma.png',
            offsetX: 0,
            offsetY: 0,
          };
          setSignatureImages([payload]);
          window.localStorage.setItem(PURCHASE_SIGNATURE_IMAGE_KEY, JSON.stringify([payload]));
          window.localStorage.removeItem(LEGACY_SIGNATURE_LEFT_KEY);
          window.localStorage.removeItem(LEGACY_SIGNATURE_RIGHT_KEY);
        }
      }
    } catch {
      /* ignore signature restoration errors */
    }
  }, []);

  const persistPurchaseLogo = useCallback((payload: { src: string; name: string } | null) => {
    if (typeof window === 'undefined') return;
    try {
      if (payload) {
        window.localStorage.setItem(PURCHASE_LOGO_STORAGE_KEY, JSON.stringify(payload));
      } else {
        window.localStorage.removeItem(PURCHASE_LOGO_STORAGE_KEY);
      }
    } catch {
      /* ignore storage issues */
    }
  }, []);

  const persistSignatureImages = useCallback((payload: PurchaseOrderSignatureImage[]) => {
    if (typeof window === 'undefined') return;
    try {
      if (payload.length) {
        window.localStorage.setItem(PURCHASE_SIGNATURE_IMAGE_KEY, JSON.stringify(payload));
      } else {
        window.localStorage.removeItem(PURCHASE_SIGNATURE_IMAGE_KEY);
      }
    } catch {
      /* ignore storage issues */
    }
  }, []);

  const persistSavedMotives = useCallback((motives: string[]) => {
    if (typeof window === 'undefined') return;
    try {
      if (motives.length) {
        window.localStorage.setItem(PURCHASE_MOTIVES_KEY, JSON.stringify(motives));
      } else {
        window.localStorage.removeItem(PURCHASE_MOTIVES_KEY);
      }
    } catch {
      /* ignore storage issues */
    }
  }, []);

  useEffect(() => {
    persistSignatureImages(signatureImages);
  }, [signatureImages, persistSignatureImages]);

  const selectedProcess = useMemo(() => processes.find(proc => proc.id === selectedId) ?? null, [processes, selectedId]);
  const rankingRows = useMemo(() => {
    if (!summary) return [];
    const seen = new Set<number>();
    return summary.rankings.filter(row => {
      if (seen.has(row.quotationId)) return false;
      seen.add(row.quotationId);
      return true;
    });
  }, [summary]);
  const handlePrintProgress = useCallback(() => {
    const rows = purchaseProgressFiltered;
    if (!rows.length) {
      window.alert('No hay ítems para imprimir con el filtro actual.');
      return;
    }
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) {
      window.alert('No se pudo abrir la ventana de impresión.');
      return;
    }
    const activeFilterLabel = (() => {
      switch (progressStatusFilter) {
        case 'PENDING':
          return 'Ítems pendientes';
        case 'R0_25':
          return '1% - 25% de avance';
        case 'R25_50':
          return '26% - 50% de avance';
        case 'R50_75':
          return '51% - 75% de avance';
        case 'R75_99':
          return '76% - 99% de avance';
        case 'R100':
          return 'Ítems completados (100%)';
        default:
          return 'Todos los ítems';
      }
    })();
    const processName = selectedProcess?.name ?? 'Proceso';
    const today = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
    const stats = purchaseProgressStats ?? {
      orderedPct: 0,
      receivedPct: 0,
      totalItems: purchaseProgressDerived.length,
      itemsWithOrder: 0,
      itemsReceived: 0,
    };
    const printableRows = rows
      .map(item => {
        const sheetLabel =
          item.sheetNames?.length && item.sheetNames.length > 0
            ? item.sheetNames.join(' / ')
            : item.sheetName ?? '—';
        const receivePct = formatPercentDetailed(item.computedReceivePct ?? item.receivePct);
        const orderPct = formatPercentDetailed(item.computedOrderPct ?? item.orderPct);
        return `<tr>
          <td>${item.description}</td>
          <td>${sheetLabel}</td>
          <td>${formatQuantity(Number(item.required) || 0, item.unit)}</td>
          <td>${formatQuantity(Number(item.ordered) || 0, item.unit)}</td>
          <td>${formatQuantity(Number(item.received) || 0, item.unit)}</td>
          <td>${formatQuantity(item.computedPendingReceive ?? (Number(item.pendingReceive) || 0), item.unit)}</td>
          <td>${orderPct}</td>
          <td>${receivePct}</td>
        </tr>`;
      })
      .join('');
    const summaryBlock = `
      <div class="section">
        <div class="section-title">Resumen operativo</div>
        <div class="totals">
          <div><strong>Avance comprometido</strong><br>${formatPercentDetailed(stats.orderedPct)}</div>
          <div><strong>Avance recibido</strong><br>${formatPercentDetailed(stats.receivedPct)}</div>
          <div><strong>Ítems con OC</strong><br>${stats.itemsWithOrder}/${stats.totalItems}</div>
          <div><strong>Ítems con guía</strong><br>${stats.itemsReceived}/${stats.totalItems}</div>
        </div>
      </div>`;
    const rowsBlock = `
      <div class="section spacing">
        <div class="section-title">Materiales (${rows.length}/${purchaseProgressDerived.length})</div>
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Hoja</th>
              <th>Requerido</th>
              <th>Ordenado</th>
              <th>Recibido</th>
              <th>Pendiente</th>
              <th>Avance OC</th>
              <th>Avance Guías</th>
            </tr>
          </thead>
          <tbody>
            ${printableRows}
          </tbody>
        </table>
      </div>`;
    printWindow.document.write(`<!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Reporte de avance</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1 { font-size: 22px; margin-bottom: 4px; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; }
            th { background: #f8fafc; text-transform: uppercase; letter-spacing: .02em; font-size: 11px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .meta { font-size: 12px; color: #475569; }
            .chip { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #e0f2fe; color: #075985; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
            .totals { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
            .totals div { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; font-size: 12px; min-width: 150px; background: #f8fafc; }
            .section { margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
            .section-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
            .spacing { margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Reporte de avance de materiales</h1>
              <p class="meta">${processName} · ${today}</p>
            </div>
            <span class="chip">${activeFilterLabel}</span>
          </div>
          ${summaryBlock}
          ${rowsBlock}
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [purchaseProgressFiltered, purchaseProgressDerived.length, purchaseProgressStats, progressStatusFilter, selectedProcess]);

const supplierGroups = useMemo(() => {
    if (!rankingRows.length) return [] as Array<{
      key: string;
      supplier: string;
      variants: Array<{ quotationId: number; label: string; currency: string }>;
    }>;
    const map = new Map<
      string,
      { key: string; supplier: string; variants: Array<{ quotationId: number; label: string; currency: string }> }
    >();
    rankingRows.forEach(row => {
      const baseLabel = extractBaseSupplierLabel(row.supplier);
      const key = normalizeSupplierKey(baseLabel);
      if (!map.has(key)) {
        map.set(key, { key, supplier: baseLabel, variants: [] });
      }
      map.get(key)!.variants.push({
        quotationId: row.quotationId,
        label: row.supplier,
        currency: row.currency,
      });
    });
    return Array.from(map.values());
  }, [rankingRows]);

const providerColumns = useMemo(() => {
    if (!supplierGroups.length) return [];
    const columns = supplierGroups.map(group => ({
      key: group.key,
      supplier: group.supplier,
      quotationIds: group.variants.map(variant => variant.quotationId),
      variantLabels: new Map(group.variants.map(variant => [variant.quotationId, variant.label])),
    }));
    const activeKeys = selectedSupplierKeys.length ? selectedSupplierKeys : columns.map(column => column.key);
    return columns.filter(column => activeKeys.includes(column.key));
  }, [supplierGroups, selectedSupplierKeys]);
  const handleSupplierColumnToggle = useCallback((supplierKey: string) => {
    setSelectedSupplierKeys(prev => {
      if (prev.includes(supplierKey)) {
        const remaining = prev.filter(key => key !== supplierKey);
        return remaining.length ? remaining : prev;
      }
      return [...prev, supplierKey];
    });
  }, []);
  const handleSelectAllSuppliers = useCallback(() => {
    if (!supplierGroups.length) return;
    setSelectedSupplierKeys(supplierGroups.map(group => group.key));
  }, [supplierGroups]);
  const handleSelectTopSuppliers = useCallback(() => {
    if (!supplierGroups.length) return;
    setSelectedSupplierKeys(supplierGroups.slice(0, Math.min(3, supplierGroups.length)).map(group => group.key));
  }, [supplierGroups]);
  const winnerRow = useMemo(() => {
    if (!summary) return null;
    return rankingRows.find(row => row.quotationId === summary.winnerId) ?? rankingRows[0] ?? null;
  }, [rankingRows, summary]);
  const sheetNames = useMemo(() => {
    if (!summary) return [];
    const names = Array.from(new Set(summary.materialComparison.map(item => item.sheetName)));
    return names.length ? names : ['Hoja'];
  }, [summary]);
  const sheetFilterOptions = useMemo(() => ['ALL', ...sheetNames], [sheetNames]);
  const filteredItems = useMemo(() => {
    if (!summary) return [];
    const term = searchTerm.trim().toLowerCase();
    return summary.materialComparison.filter(item => {
      const matchesSheet = selectedSheet === 'ALL' ? true : item.sheetName === selectedSheet;
      const matchesTerm = term ? item.description.toLowerCase().includes(term) : true;
      return matchesSheet && matchesTerm;
    });
  }, [summary, selectedSheet, searchTerm]);
  const sheetSummaries = useMemo(() => summary?.sheetSummaries ?? [], [summary]);
  const sheetCoverage = useMemo(() => {
    if (!summary) return new Map<string, { baseCount: number; suppliers: Map<number, number> }>();
    const coverageMap = new Map<string, { baseCount: number; suppliers: Map<number, number> }>();
    summary.materialComparison.forEach(item => {
      const entry = coverageMap.get(item.sheetName) ?? { baseCount: 0, suppliers: new Map<number, number>() };
      entry.baseCount += 1;
      item.offers.forEach(offer => {
        const current = entry.suppliers.get(offer.quotationId) ?? 0;
        entry.suppliers.set(offer.quotationId, current + 1);
      });
      coverageMap.set(item.sheetName, entry);
    });
    return coverageMap;
  }, [summary]);
  const sheetSummaryRows = useMemo(() => {
    if (!summary) return [];
    const totalsBySheet = new Map(sheetSummaries.map(sheet => [sheet.sheetName, sheet]));
    const allNames = sheetNames.length ? sheetNames : Array.from(totalsBySheet.keys());
    return allNames.map(name => {
      const coverage = sheetCoverage.get(name);
      const totals = totalsBySheet.get(name);
      return {
        sheetName: name,
        baseCount: coverage?.baseCount ?? 0,
        baseTotal: totals?.baseTotal ?? 0,
        suppliers: rankingRows.map(row => {
          const supplierTotals = totals?.suppliers.find(s => s.quotationId === row.quotationId);
          const matched = coverage?.suppliers.get(row.quotationId) ?? 0;
          return {
            quotationId: row.quotationId,
            supplier: row.supplier,
            total: supplierTotals?.total ?? null,
            matched,
          };
        }),
      };
    });
  }, [rankingRows, sheetCoverage, sheetNames, sheetSummaries, summary]);
  const bestOfferStats = useMemo(() => {
    if (!summary) return new Map<number, { bestItems: number; savings: Array<{ description: string; saving: number; bestTotal: number; secondTotal: number }> }>();
    const map = new Map<number, { bestItems: number; savings: Array<{ description: string; saving: number; bestTotal: number; secondTotal: number }> }>();
    summary.materialComparison.forEach(item => {
      if (!item.offers.length) return;
      const offers = [...item.offers].filter(offer => offer.quotationId);
      if (!offers.length) return;
      offers.sort((a, b) => {
        const totalA = computeOfferTotal(a, item.baseQuantity) ?? Number.POSITIVE_INFINITY;
        const totalB = computeOfferTotal(b, item.baseQuantity) ?? Number.POSITIVE_INFINITY;
        return totalA - totalB;
      });
      const best = offers[0];
      if (!best || best.quotationId === undefined) return;
      const entry = map.get(best.quotationId) || { bestItems: 0, savings: [] };
      entry.bestItems += 1;
      if (offers.length > 1) {
        const bestTotal = computeOfferTotal(best, item.baseQuantity) ?? 0;
        const runner = offers[1];
        const runnerTotal = computeOfferTotal(runner, item.baseQuantity) ?? bestTotal;
        const saving = runnerTotal - bestTotal;
        if (saving > 0) {
          entry.savings.push({
            description: item.description,
            saving,
            bestTotal,
            secondTotal: runnerTotal,
          });
        }
      }
      map.set(best.quotationId, entry);
    });
    return map;
  }, [summary]);
  const supplierCoverageRows = useMemo(() => {
    if (!summary) return [];
    const totalItems = summary.process.baselineCount || 1;
    return rankingRows.map(row => {
      const bestInfo = bestOfferStats.get(row.quotationId);
      return {
        quotationId: row.quotationId,
        supplier: row.supplier,
        coveragePct: row.coveragePct ?? row.itemsMatched / totalItems,
        itemsMatched: row.itemsMatched,
        normalizedAmount: row.normalizedAmount ?? row.totalAmount ?? null,
        bestItems: bestInfo?.bestItems ?? 0,
        missing: row.missing,
      };
    });
  }, [bestOfferStats, rankingRows, summary]);
  const filteredCoverageRows = useMemo(() => {
    const term = coverageSearch.trim().toLowerCase();
    return supplierCoverageRows.filter(row => {
      const matchesTerm = term ? row.supplier.toLowerCase().includes(term) : true;
      const coverage = clamp01(row.coveragePct ?? 0);
      let matchesStatus = true;
      if (coverageStatusFilter === 'FULL') {
        matchesStatus = coverage >= 0.999;
      } else if (coverageStatusFilter === 'PENDING') {
        matchesStatus = coverage < 0.999;
      }
      return matchesTerm && matchesStatus;
    });
  }, [coverageSearch, coverageStatusFilter, supplierCoverageRows]);
  const selectedPurchaseSupplier = useMemo(() => {
    if (!purchaseSupplierId) return null;
    return rankingRows.find(row => row.quotationId === purchaseSupplierId) ?? null;
  }, [purchaseSupplierId, rankingRows]);
const resolvedSupplierName =
  purchaseForm.supplierDisplayName.trim()
    || purchaseSupplierInput
    || selectedPurchaseSupplier?.supplier
    || 'Proveedor';
  const purchaseCurrency = summary?.process.baseCurrency ?? 'PEN';

  type PurchaseOrderLineEntry = NonNullable<PurchaseOrderLogEntry['lines']>[number];

  const normalizeIssuedDate = (value?: string) => {
    if (!value) return todayInputDate();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return todayInputDate();
    parsed.setMinutes(parsed.getMinutes() - parsed.getTimezoneOffset());
    return parsed.toISOString().slice(0, 10);
  };

  const snapshotItemToOrderItem = (item: PurchaseOrderPreviewItem): PurchaseOrderItem => ({
    id: generateItemId(),
    baselineId: item.baselineId ?? undefined,
    description: item.description,
    unit: item.unit ?? '',
    quantity:
      typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null,
    unitPrice:
      typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) ? item.unitPrice : null,
    itemCode: item.itemCode ?? undefined,
    autoLinked: item.autoLinked ?? Boolean(item.baselineId),
    supplierRowOrder: item.supplierRowOrder ?? null,
    providerDescription: item.providerDescription ?? null,
  });

  const lineToOrderItem = (line: PurchaseOrderLineEntry): PurchaseOrderItem => {
    const metadata = (line.metadata ?? {}) as { providerDescription?: string };
    return {
      id: generateItemId(),
      baselineId: line.baselineId ?? undefined,
      description: line.description,
      unit: line.unit ?? '',
      quantity:
        typeof line.quantity === 'number' && Number.isFinite(line.quantity) ? line.quantity : null,
      unitPrice:
        typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) ? line.unitPrice : null,
      autoLinked: Boolean(line.baselineId),
      supplierRowOrder: null,
      providerDescription:
        typeof metadata.providerDescription === 'string' ? metadata.providerDescription : null,
    };
  };

  const buildFormFromOrder = (order: PurchaseOrderLogEntry): PurchaseOrderFormData => {
    const base = defaultPurchaseForm();
    const snapshotForm = (order.snapshot?.form ?? {}) as Partial<PurchaseOrderFormData>;
    return {
      ...base,
      ...snapshotForm,
      orderNumber: snapshotForm.orderNumber ?? order.orderNumber ?? base.orderNumber,
      issueDate: normalizeIssuedDate(snapshotForm.issueDate ?? order.issueDate),
      supplierDisplayName: snapshotForm.supplierDisplayName ?? order.supplierName ?? base.supplierDisplayName,
    };
  };

  const buildItemsFromOrder = (order: PurchaseOrderLogEntry): PurchaseOrderItem[] => {
    if (Array.isArray(order.snapshot?.items) && order.snapshot.items.length) {
      return order.snapshot.items
        .map(snapshotItemToOrderItem)
        .filter(item => item.description && item.description.trim());
    }
    return (order.lines ?? [])
      .map(lineToOrderItem)
      .filter(item => item.description && item.description.trim());
  };

  const applyPurchaseOrderSnapshot = useCallback(
    (order: PurchaseOrderLogEntry, mode: 'EDIT' | 'REUSE') => {
      const form = buildFormFromOrder(order);
      const finalOrderNumber = mode === 'EDIT' ? form.orderNumber : nextOrderNumber || form.orderNumber;
      const finalForm = { ...form, orderNumber: finalOrderNumber };
      const items = buildItemsFromOrder(order);
      setPurchaseForm(finalForm);
      setPurchaseItems(items);
      setPurchaseSupplierId(order.quotationId ?? null);
      setPurchaseSupplierInput(finalForm.supplierDisplayName);
      setPurchaseItemQuery('');
      const meta = order.snapshot?.meta;
      if (meta && typeof meta.igvRate === 'number') {
        setPurchaseIgvRate(meta.igvRate);
      } else {
        setPurchaseIgvRate(0.18);
      }
      if (meta && typeof meta.discountPct === 'number') {
        setPurchaseDiscountPct(meta.discountPct);
      } else {
        setPurchaseDiscountPct(0);
      }
      setSortBySupplierOrder(false);
      setSupplierSheetFilter('ALL');
      setPurchaseSaveStatus(prev => ({ ...prev, message: null }));
      setOrderNumberTouched(mode === 'EDIT');
      if (mode === 'EDIT') {
        setEditingOrderId(order.id);
      } else {
        setEditingOrderId(null);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [
      buildFormFromOrder,
      buildItemsFromOrder,
      nextOrderNumber,
      setPurchaseForm,
      setPurchaseItems,
      setPurchaseSupplierId,
      setPurchaseSupplierInput,
      setPurchaseItemQuery,
      setPurchaseIgvRate,
      setPurchaseDiscountPct,
      setSortBySupplierOrder,
      setSupplierSheetFilter,
      setPurchaseSaveStatus,
      setOrderNumberTouched,
    ],
  );
  const purchaseItemSuggestions = useMemo(() => {
    if (!summary) return [];
    const term = purchaseItemQuery.trim().toLowerCase();
    if (term.length < 2) return [];
    const taken = new Set(
      purchaseItems
        .map(item => item.baselineId)
        .filter((id): id is number => typeof id === 'number'),
    );
    return summary.materialComparison
      .filter(item => {
        if (taken.has(item.baselineId)) return false;
        const description = item.description.toLowerCase();
        const code = normalizeItemCode(item.itemCode)?.toLowerCase() ?? '';
        return description.includes(term) || (code && code.includes(term));
      })
      .slice(0, 6);
  }, [purchaseItemQuery, purchaseItems, summary]);

  const purchaseTotals = useMemo(() => {
    const subtotal = purchaseItems.reduce((acc, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      return acc + qty * price;
    }, 0);
    const rate = purchaseIgvRate > 0 ? purchaseIgvRate : 0;
    const discountRate = purchaseDiscountPct > 0 ? purchaseDiscountPct : 0;
    const discount = Math.min(subtotal, subtotal * discountRate);
    const netSubtotal = Math.max(0, subtotal - discount);
    const igv = netSubtotal * rate;
    return {
      subtotal,
      discountRate,
      discount,
      netSubtotal,
      igv,
      total: netSubtotal + igv,
    };
  }, [purchaseDiscountPct, purchaseItems, purchaseIgvRate]);
  const purchaseSaveButtonLabel = purchaseSaveStatus.loading
    ? editingOrderId
      ? 'Actualizando…'
      : 'Guardando…'
    : editingOrderId
      ? 'Actualizar orden'
      : 'Guardar orden';

  const selectedDeliveryOrder = useMemo(() => {
    if (!deliveryDraft.orderId) return null;
    return purchaseHistory.find(order => order.id === deliveryDraft.orderId) ?? null;
  }, [deliveryDraft.orderId, purchaseHistory]);
  const editingOrder = useMemo(
    () => (editingOrderId ? purchaseHistory.find(order => order.id === editingOrderId) ?? null : null),
    [editingOrderId, purchaseHistory],
  );

  useEffect(() => {
    if (!summaryProcessId) {
      setDeliveryDraft(defaultDeliveryDraft(resolvedSupplierName));
      clearDeliveryDraft();
      return;
    }
    const stored = loadDeliveryDraft();
    if (stored && stored.processId === summaryProcessId) {
      setDeliveryDraft(stored.draft);
    } else {
      setDeliveryDraft(defaultDeliveryDraft(resolvedSupplierName));
    }
  }, [summaryProcessId, resolvedSupplierName]);

  useEffect(() => {
    if (!summaryProcessId) return;
    persistDeliveryDraft({ processId: summaryProcessId, draft: deliveryDraft });
  }, [deliveryDraft, summaryProcessId]);

  useEffect(() => {
    if (!resolvedSupplierName) return;
    setDeliveryDraft(prev => {
      if (prev.supplierName?.trim()) return prev;
      return { ...prev, supplierName: resolvedSupplierName };
    });
  }, [resolvedSupplierName]);

  const refreshProcesses = useCallback(async (preferredId?: number): Promise<number | null> => {
    setListLoading(true);
    setGlobalError(null);
    try {
      const list = await listQuotationProcesses();
      setProcesses(list);
      const candidate = (() => {
        if (preferredId) return preferredId;
        if (selectedId && list.some(item => item.id === selectedId)) return selectedId;
        return list[0]?.id ?? null;
      })();
      setSelectedId(candidate ?? null);
      if (!list.length) {
        setSummary(null);
      }
      return candidate ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar los procesos';
      setGlobalError(message);
      return null;
    } finally {
      setListLoading(false);
    }
  }, [selectedId]);

  const loadSummary = useCallback(async (processId: number) => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await fetchQuotationSummary(processId);
      setSummary(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar el resumen';
      setSummaryError(message);
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProcesses();
  }, [refreshProcesses]);

  useEffect(() => {
    if (!sheetNames.length) {
      setSelectedSheet('');
      return;
    }
    setSelectedSheet(prev => (prev && sheetNames.includes(prev) ? prev : sheetNames[0]));
  }, [sheetNames]);

  useEffect(() => {
    if (!supplierGroups.length) {
      setSelectedSupplierKeys([]);
      return;
    }
    setSelectedSupplierKeys(prev => {
      const stillValid = prev.filter(key => supplierGroups.some(group => group.key === key));
      if (stillValid.length) return stillValid;
      return supplierGroups.slice(0, Math.min(3, supplierGroups.length)).map(group => group.key);
    });
  }, [supplierGroups]);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        await loadSummary(selectedId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadSummary]);

  useEffect(() => {
    if (!summary || !rankingRows.length) return;
    setPurchaseSupplierId(prev => {
      if (prev && rankingRows.some(row => row.quotationId === prev)) {
        return prev;
      }
      return summary.winnerId ?? rankingRows[0]?.quotationId ?? null;
    });
  }, [rankingRows, summary]);

  useEffect(() => {
    if (!summaryProcessId) {
      setPurchaseItems([]);
      setPurchaseSupplierId(null);
      setPurchaseSupplierInput('');
      setPurchaseItemQuery('');
      setPurchaseIgvRate(0.18);
      setPurchaseDiscountPct(0);
      setPurchaseForm(defaultPurchaseForm());
      clearPurchaseDraft();
      return;
    }
    const draft = loadPurchaseDraft();
    if (draft && draft.processId === summaryProcessId) {
      setPurchaseForm({ ...defaultPurchaseForm(), ...draft.form });
      setPurchaseItems(draft.items);
      setPurchaseIgvRate(draft.igvRate ?? 0.18);
      setPurchaseDiscountPct(draft.discountPct ?? 0);
      setPurchaseSupplierInput(draft.supplierInput ?? '');
      setPurchaseSupplierId(draft.supplierId ?? null);
      return;
    }
    setPurchaseItems([]);
    setPurchaseItemQuery('');
    setPurchaseSupplierId(null);
    setPurchaseSupplierInput('');
    setPurchaseIgvRate(0.18);
    setPurchaseDiscountPct(0);
    setPurchaseForm(defaultPurchaseForm());
  }, [summaryProcessId]);

  useEffect(() => {
    if (!summary) return;
    setPurchaseForm(prev => {
      const next = { ...prev };
      let changed = false;
      if (!prev.orderNumber.trim()) {
        next.orderNumber = summary.process.code ?? `OC-${String(summary.process.id).padStart(3, '0')}`;
        changed = true;
      }
      if (!prev.motive.trim()) {
        next.motive = summary.process.name;
        changed = true;
      }
      if (!prev.scope.trim() && summary.process.notes) {
        next.scope = summary.process.notes;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [summary]);

  useEffect(() => {
    if (!summaryProcessId) {
      setPurchaseHistory([]);
      setNextOrderNumber('001/CP');
      setPurchaseHistoryError(null);
      setOrderNumberTouched(false);
      return;
    }
    setPurchaseHistoryLoading(true);
    setPurchaseHistoryError(null);
    fetchPurchaseOrders(summaryProcessId)
      .then(data => {
        setPurchaseHistory(data.orders);
        setNextOrderNumber(data.nextOrderNumber);
        setOrderNumberTouched(false);
      })
      .catch(err => {
      setPurchaseHistoryError(err instanceof Error ? err.message : 'No se pudo cargar las órdenes guardadas');
    })
    .finally(() => setPurchaseHistoryLoading(false));
}, [summaryProcessId]);

  useEffect(() => {
    setEditingOrderId(null);
  }, [summaryProcessId]);

  useEffect(() => {
    if (!purchaseHistory.length) return;
    if (deliveryMode !== 'ORDER') return;
    setDeliveryDraft(prev => {
      if (prev.orderId) return prev;
      return { ...prev, orderId: purchaseHistory[0]?.id ?? null };
    });
  }, [purchaseHistory, deliveryMode]);

  useEffect(() => {
    refreshPurchaseProgress();
  }, [refreshPurchaseProgress]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  useEffect(() => {
    if (!nextOrderNumber || orderNumberTouched) return;
    setPurchaseForm(prev => ({ ...prev, orderNumber: nextOrderNumber }));
  }, [nextOrderNumber, orderNumberTouched]);

  useEffect(() => {
    if (!purchaseSupplierId) return;
    const match = rankingRows.find(row => row.quotationId === purchaseSupplierId);
    if (!match) return;
    setPurchaseSupplierInput(match.supplier);
    setPurchaseForm(prev => {
      if (prev.supplierDisplayName.trim()) return prev;
      return { ...prev, supplierDisplayName: match.supplier };
    });
  }, [purchaseSupplierId, rankingRows]);

  useEffect(() => {
    if (!summaryProcessId) return;
    const draft: PurchaseOrderDraft = {
      processId: summaryProcessId,
      form: purchaseForm,
      items: purchaseItems,
      igvRate: purchaseIgvRate,
      discountPct: purchaseDiscountPct,
      supplierInput: purchaseSupplierInput,
      supplierId: purchaseSupplierId,
    };
    persistPurchaseDraft(draft);
  }, [
    purchaseDiscountPct,
    purchaseForm,
    purchaseItems,
    purchaseIgvRate,
    purchaseSupplierInput,
    purchaseSupplierId,
    summaryProcessId,
  ]);

  const handleBaseSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!baseForm.name.trim()) {
      setBaseStatus({ loading: false, error: 'Ingresa un nombre para el proceso' });
      return;
    }
    if (!baseForm.file) {
      setBaseStatus({ loading: false, error: 'Selecciona el archivo base (Excel)' });
      return;
    }
    const formData = new FormData();
    formData.append('name', baseForm.name.trim());
    if (baseForm.code.trim()) formData.append('code', baseForm.code.trim());
    if (baseForm.baseCurrency.trim()) formData.append('baseCurrency', baseForm.baseCurrency.trim().toUpperCase());
    if (baseForm.exchangeRate.trim()) formData.append('exchangeRate', baseForm.exchangeRate.trim());
    if (baseForm.targetMarginPct.trim()) formData.append('targetMarginPct', baseForm.targetMarginPct.trim());
    if (baseForm.notes.trim()) formData.append('notes', baseForm.notes.trim());
    formData.append('file', baseForm.file);

    setBaseStatus({ loading: true });
    try {
      const result = await uploadQuotationBase(formData);
      setBaseStatus({
        loading: false,
        message: `Base importada (${result.baselineCount} ítems)`,
      });
      setBaseFileKey(key => key + 1);
      setBaseForm(prev => ({ ...prev, file: null }));
      const nextId = await refreshProcesses(result.processId);
      if (nextId) {
        await loadSummary(nextId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo importar la base';
      setBaseStatus({ loading: false, error: message });
    }
  };

  const handleBaseFileClear = () => {
    setBaseForm(prev => ({ ...prev, file: null }));
    setBaseFileKey(key => key + 1);
  };

  const handleSupplierSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) {
      setSupplierStatus({ loading: false, error: 'Selecciona un proceso primero' });
      return;
    }
    if (!supplierForm.file) {
      setSupplierStatus({ loading: false, error: 'Adjunta el archivo de la cotización del proveedor' });
      return;
    }
    const formData = new FormData();
    const supplierBase = supplierForm.supplierName.trim();
    const label = supplierForm.label.trim();
    const displayName = [supplierBase, label].filter(Boolean).join(' · ');
    if (displayName) formData.append('supplierName', displayName);
    const targetQuotationId = supplierForm.targetQuotationId ? Number(supplierForm.targetQuotationId) : null;
    if (targetQuotationId) {
      formData.append('quotationId', String(targetQuotationId));
    }
    if (supplierForm.currency.trim()) formData.append('currency', supplierForm.currency.trim().toUpperCase());
    if (supplierForm.exchangeRate.trim()) formData.append('exchangeRate', supplierForm.exchangeRate.trim());
    if (supplierForm.notes.trim()) formData.append('notes', supplierForm.notes.trim());
    formData.append('file', supplierForm.file);

    setSupplierStatus({ loading: true });
    try {
      const result = await uploadSupplierQuote(selectedId, formData);
      setSupplierStatus({
        loading: false,
        message:
          result.mode === 'UPDATED'
            ? `Cotización actualizada (${result.matchedItems}/${result.importedItems} ítems)`
            : `Cotización cargada (${result.matchedItems}/${result.importedItems} ítems vinculados)`,
      });
      setSupplierFileKey(key => key + 1);
      setSupplierForm(prev => ({ ...prev, file: null, label: '', targetQuotationId: '' }));
      const nextId = await refreshProcesses(selectedId ?? undefined);
      if (nextId) {
        await loadSummary(nextId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo importar la cotización';
      setSupplierStatus({ loading: false, error: message });
    }
  };

const handleSupplierFileClear = () => {
  setSupplierForm(prev => ({ ...prev, file: null }));
  setSupplierFileKey(key => key + 1);
};

  const handleDeleteSupplierQuote = async (quotationId: number, force?: boolean) => {
    if (!summary) return;
    const target = summary.quotations.find(q => q.id === quotationId);
    const label = target?.supplier ?? `Proveedor #${quotationId}`;
    const ok = window.confirm(`¿Eliminar la cotización "${label}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    setSupplierDeleteId(quotationId);
    try {
      await deleteSupplierQuote(quotationId, { force });
      await refreshProcesses(selectedId ?? undefined);
      if (selectedId) {
        await loadSummary(selectedId);
      }
    } catch (error: any) {
      const message = error?.message ?? 'No se pudo eliminar la cotización.';
      if (!force && message.toLowerCase().includes('órdenes de compra')) {
        const confirmCascade = window.confirm(
          'Esta cotización tiene órdenes de compra y guías asociadas.\n'
            + 'Si continúas, se eliminarán también esas órdenes y guías.\n¿Deseas proceder?',
        );
        if (confirmCascade) {
          setSupplierDeleteId(null);
          await handleDeleteSupplierQuote(quotationId, true);
          return;
        }
      } else {
        window.alert(message);
      }
    } finally {
      setSupplierDeleteId(null);
    }
  };

  const handleLogoUpload = (file?: File | null) => {
    if (!file) {
      setPurchaseLogoError(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPurchaseLogoError('Selecciona un archivo de imagen PNG, JPG, WebP o SVG.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setPurchaseLogoError('El logo supera los 3 MB. Comprime el archivo e intenta nuevamente.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const payload = { src: reader.result as string, name: file.name };
      setPurchaseLogo(payload);
      setPurchaseLogoError(null);
      persistPurchaseLogo(payload);
    };
    reader.onerror = () => {
      setPurchaseLogoError('No se pudo leer el archivo. Intenta con otro formato.');
    };
    reader.readAsDataURL(file);
  };

  const handleLogoReset = () => {
    setPurchaseLogo(null);
    setPurchaseLogoError(null);
    persistPurchaseLogo(null);
  };

  const handleSignatureUpload = (files?: FileList | null) => {
    if (!files || files.length === 0) return;
    const availableSlots = MAX_SIGNATURE_IMAGES - signatureImages.length;
    if (availableSlots <= 0) {
      setSignatureError(`Ya tienes ${MAX_SIGNATURE_IMAGES} firmas cargadas.`);
      return;
    }
    const selectedFiles = Array.from(files).slice(0, availableSlots);
    selectedFiles.forEach(file => {
      if (!file.type.startsWith('image/')) {
        setSignatureError('Selecciona archivos de imagen PNG, JPG, WebP o SVG.');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setSignatureError('Cada firma debe pesar menos de 2 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const payload: PurchaseOrderSignatureImage = {
          id: generateSignatureId(),
          src: reader.result as string,
          name: file.name,
          offsetX: 0,
          offsetY: 0,
        };
        setSignatureImages(prev => [...prev, payload]);
        setSignatureError(null);
      };
      reader.onerror = () => {
        setSignatureError('No se pudo leer uno de los archivos de firma.');
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSignatureRemove = (id: string) => {
    setSignatureImages(prev => prev.filter(image => image.id !== id));
  };

  const handleSignatureCenter = (id: string) => {
    setSignatureImages(prev =>
      prev.map(image => (image.id === id ? { ...image, offsetX: 0, offsetY: 0 } : image)),
    );
  };

  const handleSignaturePositionChange = (signatureId: string, offset: { x: number; y: number }) => {
    setSignatureImages(prev =>
      prev.map(image =>
        image.id === signatureId ? { ...image, offsetX: offset.x, offsetY: offset.y } : image,
      ),
    );
  };

  const handleMotiveBlur = () => {
    const value = purchaseForm.motive.trim();
    if (!value) return;
    setSavedMotives(prev => {
      if (prev.some(item => item.toLowerCase() === value.toLowerCase())) return prev;
      const next = [value, ...prev].slice(0, 15);
      persistSavedMotives(next);
      return next;
    });
  };

  const handleSupplierInputChange = (value: string) => {
    setPurchaseSupplierInput(value);
    setPurchaseForm(prev => ({ ...prev, supplierDisplayName: value }));
    const match = rankingRows.find(row => row.supplier.toLowerCase() === value.trim().toLowerCase());
    setPurchaseSupplierId(match ? match.quotationId : null);
  };

  const resolveOfferForRow = (
    row: QuotationMaterialComparisonRow,
    options?: { requireSupplier?: boolean },
  ) => {
    if (purchaseSupplierId) {
      const direct = row.offers.find(offer => offer.quotationId === purchaseSupplierId);
      if (direct) return direct;
      return options?.requireSupplier ? null : null;
    }
    if (options?.requireSupplier) return null;
    return row.bestOffer ?? null;
  };

  const buildItemFromRow = (row: QuotationMaterialComparisonRow): PurchaseOrderItem => {
    const offer = resolveOfferForRow(row);
    const quantity = toSafeNumber(offer?.quantity ?? row.baseQuantity ?? 0);
    const unitPrice = toSafeNumber(offer?.unitPrice ?? row.baseUnitPrice ?? 0);
    const fallbackProviderDescription =
      row.baselineId != null ? supplierOfferDescriptions.get(row.baselineId) ?? null : null;
    return {
      id: generateItemId(),
      baselineId: row.baselineId,
      description: row.description,
      unit: row.unit ?? '',
      quantity,
      unitPrice,
      itemCode: normalizeItemCode(row.itemCode),
      autoLinked: true,
      supplierRowOrder: offer?.rowOrder ?? null,
      providerDescription: offer?.offeredDescription ?? fallbackProviderDescription,
    } as PurchaseOrderItem;
  };

  const handleAddBaselineItem = (row: QuotationMaterialComparisonRow) => {
    setPurchaseItems(prev => {
      const nextItem = buildItemFromRow(row);
      const existingIndex = prev.findIndex(item => item.baselineId === row.baselineId);
      if (existingIndex >= 0) {
        const copy = [...prev];
        copy[existingIndex] = { ...copy[existingIndex], ...nextItem };
        return copy;
      }
      return [...prev, nextItem];
    });
    setPurchaseItemQuery('');
  };

  const handleCreateManualItem = (description?: string) => {
    const safeDescription = description?.trim() || 'Nuevo ítem';
    setPurchaseItems(prev => [
      ...prev,
      {
        id: generateItemId(),
        description: safeDescription,
        quantity: 0,
        unit: '',
        unitPrice: 0,
        autoLinked: false,
        providerDescription: null,
      },
    ]);
    setPurchaseItemQuery('');
  };

  const handleClearPurchaseItems = () => {
    if (!purchaseItems.length) return;
    const ok = window.confirm('¿Deseas eliminar todos los ítems de la orden de compra?');
    if (!ok) return;
    setPurchaseItems([]);
  };

  const handleResetPurchaseOrder = () => {
    const ok = window.confirm('Esto borrará todo el formulario de la orden y los ítems cargados. ¿Deseas continuar?');
    if (!ok) return;
    setPurchaseItems([]);
    setPurchaseForm(defaultPurchaseForm());
    setEditingOrderId(null);
    setPurchaseSupplierId(null);
    setPurchaseSupplierInput('');
    setPurchaseItemQuery('');
    setPurchaseDiscountPct(0);
    setPurchaseIgvRate(0.18);
    setSortBySupplierOrder(false);
    setSupplierSheetFilter('ALL');
    setOrderNumberTouched(false);
    clearPurchaseDraft();
  };

  const handleReusePurchaseOrder = useCallback(
    (order: PurchaseOrderLogEntry) => {
      applyPurchaseOrderSnapshot(order, 'REUSE');
    },
    [applyPurchaseOrderSnapshot],
  );

  const handleEditPurchaseOrder = useCallback(
    (order: PurchaseOrderLogEntry) => {
      applyPurchaseOrderSnapshot(order, 'EDIT');
    },
    [applyPurchaseOrderSnapshot],
  );

  const handleExitPurchaseOrderEdit = useCallback(() => {
    setEditingOrderId(null);
  }, []);

  const handleSavePurchaseOrder = async () => {
    if (!summaryProcessId) {
      window.alert('Primero selecciona un proceso de cotización.');
      return;
    }
    if (!purchaseItems.length) {
      window.alert('Agrega al menos un ítem antes de guardar la orden.');
      return;
    }
    setPurchaseSaveStatus({ loading: true, error: null, message: null });
    try {
      const payload = {
        quotationId: purchaseSupplierId ?? undefined,
        supplierName: resolvedSupplierName,
        orderNumber: purchaseForm.orderNumber?.trim() || undefined,
        issueDate: purchaseForm.issueDate,
        currency: purchaseCurrency,
        totals: purchaseTotals,
        snapshot: {
          form: purchaseForm,
          items: purchaseItems,
          meta: {
            igvRate: purchaseIgvRate,
            discountPct: purchaseDiscountPct,
          },
        },
      };
      const linesPayload = purchaseItems.map(item => ({
        baselineId: item.baselineId ?? undefined,
        description: item.description,
        unit: item.unit ?? undefined,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        totalPrice: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        metadata: item.providerDescription ? { providerDescription: item.providerDescription } : undefined,
      }));
      const requestPayload = {
        ...payload,
        lines: linesPayload,
      };
      if (editingOrderId) {
        const response = await updatePurchaseOrder(summaryProcessId, editingOrderId, requestPayload);
        setPurchaseHistory(prev =>
          prev.map(order => (order.id === editingOrderId ? response.order : order)),
        );
        await refreshPurchaseProgress();
        setPurchaseSaveStatus({
          loading: false,
          error: null,
          message: `Orden ${response.order.orderNumber} actualizada.`,
        });
      } else {
        const response = await savePurchaseOrder(summaryProcessId, requestPayload);
        setPurchaseHistory(prev => [response.order, ...prev]);
        setNextOrderNumber(response.nextOrderNumber);
        await refreshPurchaseProgress();
        setPurchaseSaveStatus({
          loading: false,
          error: null,
          message: `Orden ${response.order.orderNumber} guardada.`,
        });
        setOrderNumberTouched(false);
      }
    } catch (err: any) {
      setPurchaseSaveStatus({
        loading: false,
        error: err?.message ?? 'No se pudo guardar la orden.',
        message: null,
      });
    }
  };

  const newDeliveryItemId = () => crypto.randomUUID?.() ?? `del-${Date.now()}`;

  const buildDeliveryItemsFromOrder = (
    order: PurchaseOrderLogEntry,
    previousItems: PurchaseDeliveryItemDraft[] = [],
  ): PurchaseDeliveryItemDraft[] => {
    if (!order.lines || order.lines.length === 0) return [];
    const previousMap = new Map<string | number, PurchaseDeliveryItemDraft>();
    previousItems.forEach(item => {
      if (item.baselineId) {
        previousMap.set(item.baselineId, item);
      }
      const descKey = item.description.trim().toLowerCase();
      if (descKey) {
        previousMap.set(descKey, item);
      }
    });
    return order.lines.map(line => {
      const descKey = line.description.trim().toLowerCase();
      const match =
        (line.baselineId !== null && line.baselineId !== undefined
          ? previousMap.get(line.baselineId)
          : undefined) ?? previousMap.get(descKey);
      return {
        id: match?.id ?? newDeliveryItemId(),
        baselineId: line.baselineId ?? undefined,
        description: line.description,
        unit: line.unit ?? match?.unit ?? undefined,
        quantity: match?.quantity ?? Number(line.quantity) ?? 0,
        notes: match?.notes,
      };
    });
  };

  const handleAddDeliveryItem = () => {
    setDeliveryDraft(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: newDeliveryItemId(),
          description: '',
          quantity: 0,
        },
      ],
    }));
  };

  const handleDeliveryFieldChange = <K extends keyof PurchaseDeliveryDraft>(
    field: K,
    value: PurchaseDeliveryDraft[K],
  ) => {
    setDeliveryDraft(prev => ({ ...prev, [field]: value }));
  };

  const handleDeliveryItemChange = (
    itemId: string,
    field: keyof PurchaseDeliveryItemDraft,
    value: string | number,
  ) => {
    setDeliveryDraft(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== itemId) return item;
        if (field === 'quantity') {
          const numeric = Number(value);
          return { ...item, quantity: Number.isFinite(numeric) ? numeric : 0 };
        }
        return {
          ...item,
          [field]: typeof value === 'string' ? value : String(value ?? ''),
        };
      }),
    }));
  };

  const handleDeliveryItemBaselineChange = (itemId: string, baselineIdValue: string) => {
    const baselineId = baselineIdValue ? Number(baselineIdValue) : undefined;
    const baseline = baselineId ? baselineMap.get(baselineId) : null;
    setDeliveryDraft(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          baselineId,
          description: baseline?.description ?? item.description,
          unit: baseline?.unit ?? item.unit,
        };
      }),
    }));
  };

  const handleAddDeliveryBaselineItem = (row: QuotationMaterialComparisonRow) => {
    setDeliveryDraft(prev => {
      if (prev.items.some(item => item.baselineId === row.baselineId)) {
        return prev;
      }
      const qty = Number(row.baseQuantity) || 0;
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            id: newDeliveryItemId(),
            baselineId: row.baselineId,
            description: row.description,
            unit: row.unit ?? '',
            quantity: qty,
          },
        ],
      };
    });
    setDeliveryItemQuery('');
  };

  const handleDeliveryOrderChange = useCallback(
    (orderId: number | null, forceReplace = false) => {
      setDeliveryAutoFillEnabled(true);
      if (!orderId) {
        setDeliveryDraft(prev => ({ ...prev, orderId: null }));
        return;
      }
      const order = purchaseHistory.find(entry => entry.id === orderId);
      setDeliveryDraft(prev => {
        if (!order) {
          return { ...prev, orderId };
        }
        const shouldReplace =
          forceReplace ||
          prev.orderId !== orderId ||
          prev.items.length === 0 ||
          prev.items.every(item => Number(item.quantity) === 0);
        const items = shouldReplace ? buildDeliveryItemsFromOrder(order, prev.items) : prev.items;
        return {
          ...prev,
          orderId,
          supplierName: prev.supplierName?.trim() || order.supplierName,
          items,
        };
      });
    },
    [purchaseHistory],
  );

  useEffect(() => {
    if (!deliveryAutoFillEnabled) return;
    if (deliveryMode !== 'ORDER') return;
    if (!deliveryDraft.orderId) return;
    if (deliveryDraft.items.length > 0) return;
    handleDeliveryOrderChange(deliveryDraft.orderId);
  }, [deliveryAutoFillEnabled, deliveryDraft.items.length, deliveryDraft.orderId, deliveryMode, handleDeliveryOrderChange]);

  const handleDeliveryModeChange = (mode: 'ORDER' | 'MANUAL') => {
    setDeliveryMode(mode);
    if (mode === 'ORDER') {
      setDeliveryAutoFillEnabled(true);
      const defaultOrderId = deliveryDraft.orderId ?? purchaseHistory[0]?.id ?? null;
      if (defaultOrderId) {
        handleDeliveryOrderChange(defaultOrderId, false);
      }
      if (!defaultOrderId) {
        setDeliveryDraft(prev => ({ ...prev, orderId: null }));
      }
    } else {
      setDeliveryAutoFillEnabled(false);
      setDeliveryDraft(prev => ({ ...prev, orderId: null }));
    }
  };

  const handleDeliveryItemDescriptionBlur = (itemId: string, value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    const baseline = baselineDescriptionMap.get(normalized);
    if (!baseline || typeof baseline.baselineId !== 'number') return;
    setDeliveryDraft(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          baselineId: baseline.baselineId ?? undefined,
          description: baseline.description,
          unit: baseline.unit ?? item.unit,
        };
      }),
    }));
  };

  const handleRemoveDeliveryItem = (itemId: string) => {
    setDeliveryDraft(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId),
    }));
  };

  const handleResetDeliveryDraft = () => {
    setDeliveryAutoFillEnabled(false);
    setDeliveryDraft(prev => ({ ...prev, items: [] }));
  };

  const handleSaveDelivery = async () => {
    if (!summaryProcessId) {
      window.alert('Selecciona un proceso antes de registrar la guía.');
      return;
    }
    if (!deliveryDraft.items.length) {
      window.alert('Agrega al menos un ítem a la guía.');
      return;
    }
    const normalizedItems = deliveryDraft.items
      .map(item => ({
        baselineId: item.baselineId,
        orderLineId: undefined,
        description: item.description.trim(),
        unit: item.unit?.trim() || undefined,
        quantity: item.quantity,
        notes: item.notes?.trim() || undefined,
      }))
      .filter(item => item.description && Number(item.quantity) > 0);
    if (!normalizedItems.length) {
      window.alert('Completa la descripción y cantidad de los ítems de la guía.');
      return;
    }
    setDeliveryStatus({ loading: true, error: null, message: null });
    try {
      await savePurchaseDelivery(summaryProcessId, {
        orderId: deliveryDraft.orderId ?? undefined,
        supplierName: deliveryDraft.supplierName.trim() || undefined,
        guideNumber: deliveryDraft.guideNumber.trim() || undefined,
        date: deliveryDraft.date,
        notes: deliveryDraft.notes?.trim() || undefined,
        items: normalizedItems,
      });
      setDeliveryStatus({ loading: false, error: null, message: 'Guía registrada correctamente.' });
      setDeliveryDraft(defaultDeliveryDraft(resolvedSupplierName, deliveryDraft.orderId));
      await Promise.all([loadDeliveries(), refreshPurchaseProgress()]);
    } catch (err: any) {
      setDeliveryStatus({
        loading: false,
        error: err?.message ?? 'No se pudo registrar la guía.',
        message: null,
      });
    }
  };

  const handleAddAllFromSupplier = () => {
    if (!purchaseSupplierId) {
      window.alert('Selecciona un proveedor ganador para traer todos sus ítems.');
      return;
    }
    if (!filteredSupplierQuoteItems.length) {
      window.alert(
        supplierSheetFilter === 'ALL'
          ? 'La cotización no tiene ítems importados para este proveedor.'
          : 'No hay ítems disponibles en la hoja seleccionada del proveedor.',
      );
      return;
    }
    const pending = filteredSupplierQuoteItems.filter((item: SupplierQuoteItem) => {
      const hasPrice =
        (typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) && item.unitPrice !== 0) ||
        (typeof item.totalPrice === 'number' && Number.isFinite(item.totalPrice) && item.totalPrice !== 0);
      if (!hasPrice) return false;
      const supplierKey = typeof item.rowOrder === 'number' ? item.rowOrder : null;
      const baselineKey = item.baselineId ?? null;
      const descriptionKey = (item.offeredDescription || item.description || '').trim().toUpperCase();

      return !purchaseItems.some(existing => {
        if (supplierKey !== null && typeof existing.supplierRowOrder === 'number') {
          return existing.supplierRowOrder === supplierKey;
        }
        if (baselineKey !== null && typeof existing.baselineId === 'number') {
          return existing.baselineId === baselineKey;
        }
        if (descriptionKey) {
          const existingDesc = (existing.providerDescription || existing.description || '').trim().toUpperCase();
          return existingDesc === descriptionKey;
        }
        return false;
      });
    });
    if (!pending.length) {
      window.alert('Todos los ítems cotizados ya están en la orden.');
      return;
    }
    const payload = pending.map((item: SupplierQuoteItem) => {
      const baseInfo = item.baselineId ? baselineMap.get(item.baselineId ?? 0) : undefined;
      const supplierQuantity = toSafeNumber(item.quantity ?? undefined);
      const quantity = supplierQuantity || toSafeNumber(baseInfo?.baseQuantity ?? 0);
      const unit = item.originalUnit ?? item.unit ?? baseInfo?.unit ?? '';
      const supplierUnitPrice =
        item.totalPrice && supplierQuantity
          ? item.totalPrice / supplierQuantity
          : item.unitPrice ?? null;
      const unitPrice = toSafeNumber(
        supplierUnitPrice ?? (quantity ? (item.totalPrice ?? 0) / quantity : 0),
      );
      const description = baseInfo?.description ?? item.description;
      return {
        id: generateItemId(),
        baselineId: item.baselineId ?? undefined,
        description,
        unit,
        quantity,
        unitPrice,
        itemCode: normalizeItemCode(item.itemCode),
        autoLinked: Boolean(item.baselineId),
        supplierRowOrder: item.rowOrder ?? null,
        providerDescription: item.offeredDescription ?? null,
      } as PurchaseOrderItem;
    });
    setPurchaseItems(prev => [...prev, ...payload]);
  };

  const handlePurchaseItemChange = (id: string, field: keyof PurchaseOrderItem, value: string | number) => {
    setPurchaseItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const next: PurchaseOrderItem = { ...item };
        if (field === 'quantity' || field === 'unitPrice') {
          if (typeof value === 'string') {
            if (!value.trim()) {
              next[field] = null as PurchaseOrderItem[typeof field];
              next.autoLinked = false;
              return next;
            }
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
              next[field] = numeric as PurchaseOrderItem[typeof field];
            }
          } else if (Number.isFinite(value)) {
            next[field] = value as PurchaseOrderItem[typeof field];
          }
          next.autoLinked = false;
        } else if (field === 'description' || field === 'unit') {
          next[field] = typeof value === 'string' ? value : String(value ?? '');
          next.autoLinked = false;
        } else if (field === 'providerDescription') {
          next.providerDescription = typeof value === 'string' ? value : String(value ?? '');
        }
        return next;
      }),
    );
  };

  const handleRemovePurchaseItem = (id: string) => {
    setPurchaseItems(prev => prev.filter(item => item.id !== id));
  };

  const handlePurchaseFormChange = <K extends keyof PurchaseOrderFormData>(
    field: K,
    value: PurchaseOrderFormData[K],
  ) => {
    if (field === 'orderNumber') {
      setOrderNumberTouched(true);
    }
    setPurchaseForm(prev => ({ ...prev, [field]: value }));
  };

  const handlePrintPurchaseOrder = () => {
    if (!purchaseItems.length) {
      window.alert('Agrega al menos un ítem antes de imprimir la orden.');
      return;
    }
    const printable = document.querySelector('.purchase-order-printable') as HTMLElement | null;
    if (!printable) {
      window.alert('No se encontró la vista previa para imprimir.');
      return;
    }

    const clone = printable.cloneNode(true) as HTMLElement;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(node => node.outerHTML)
      .join('\n');

    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) {
      window.alert('Habilita las ventanas emergentes del navegador para imprimir la orden.');
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Orden de compra</title>
  ${styles}
  <style>
    @page { size: A4; margin: 12mm; }
    body { margin: 0; background: #fff; }
    .purchase-order-page { box-shadow: none !important; border: none !important; margin: 0 auto !important; }
  </style>
</head>
<body>${clone.outerHTML}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    const handlePrint = () => {
      printWindow.print();
      printWindow.close();
    };
    if (printWindow.document.readyState === 'complete') {
      handlePrint();
    } else {
      printWindow.onload = handlePrint;
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Procesos de cotización</h2>
            <p className="text-sm text-slate-500">Selecciona un proceso para ver sus comparativos</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => refreshProcesses(selectedId ?? undefined)}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-slate-400"
              disabled={listLoading}
            >
              {listLoading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        {globalError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{globalError}</p>}
        <div className="flex flex-wrap gap-3">
          {processes.map(proc => (
            <button
              key={proc.id}
              type="button"
              onClick={() => setSelectedId(proc.id)}
              className={`min-w-[180px] rounded-md border px-3 py-2 text-left text-sm ${
                proc.id === selectedId
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <p className="font-medium">{proc.name}</p>
              <p className="text-xs text-slate-500">
                {proc.code ? `${proc.code} • ` : ''}
                {proc.baseCurrency}
              </p>
              <p className="text-xs text-slate-500">{proc.baselineItems} ítems • {proc.quotations} cotizaciones</p>
            </button>
          ))}
          {!processes.length && !listLoading && (
            <p className="text-sm text-slate-500">Aún no hay procesos registrados.</p>
          )}
        </div>
        <div className="md:col-span-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          ¿Necesitas una guía? Usa las plantillas ubicadas en <code>api/backups/plantillas/</code> (`plantilla-base.xlsx` para la propuesta oficial y `plantilla-cotizacion.xlsx` para los proveedores).
          Al mantener esos encabezados el sistema puede comparar automáticamente precios unitarios y totales.
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold">1. Importar base oficial</h3>
          <p className="mb-3 text-sm text-slate-500">Carga tu Excel maestro con los ítems y precios de referencia.</p>
          <form className="space-y-3" onSubmit={handleBaseSubmit}>
            <div>
              <label className="text-sm font-medium text-slate-700">Nombre del proceso *</label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={baseForm.name}
                onChange={e => setBaseForm(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Código / referencia</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={baseForm.code}
                  onChange={e => setBaseForm(prev => ({ ...prev, code: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Moneda base</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
                  value={baseForm.baseCurrency}
                  onChange={e => setBaseForm(prev => ({ ...prev, baseCurrency: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Tipo de cambio (a moneda base)</label>
                <input
                  type="number"
                  step="0.0001"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={baseForm.exchangeRate}
                  onChange={e => setBaseForm(prev => ({ ...prev, exchangeRate: e.target.value }))}
                  placeholder="3.75"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Margen objetivo (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={baseForm.targetMarginPct}
                  onChange={e => setBaseForm(prev => ({ ...prev, targetMarginPct: e.target.value }))}
                  placeholder="15"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Notas</label>
              <textarea
                className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={baseForm.notes}
                onChange={e => setBaseForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Archivo (Excel / PDF) *</label>
              <input
                key={baseFileKey}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                className="mt-1 w-full text-sm"
                onChange={e => setBaseForm(prev => ({ ...prev, file: e.target.files?.[0] ?? null }))}
              />
              {baseForm.file && (
                <button
                  type="button"
                  onClick={handleBaseFileClear}
                  className="mt-2 text-xs font-semibold text-rose-600 hover:underline"
                >
                  Quitar archivo
                </button>
              )}
            </div>
            {baseStatus.error && <p className="text-sm text-red-600">{baseStatus.error}</p>}
            {baseStatus.message && <p className="text-sm text-green-600">{baseStatus.message}</p>}
            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
              disabled={baseStatus.loading}
            >
              {baseStatus.loading ? 'Importando…' : 'Importar base'}
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold">2. Subir cotización de proveedor</h3>
          {selectedProcess ? (
            <>
              <p className="mb-3 text-sm text-slate-500">Adjunta el archivo recibido y convierte todo a {selectedProcess.baseCurrency}.</p>
              <form className="space-y-3" onSubmit={handleSupplierSubmit}>
                <div>
                  <label className="text-sm font-medium text-slate-700">Nombre del proveedor</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={supplierForm.supplierName}
                    onChange={e => setSupplierForm(prev => ({ ...prev, supplierName: e.target.value }))}
                    placeholder="Ej. MIMSA"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Etiqueta interna (opcional)</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={supplierForm.label}
                    onChange={e => setSupplierForm(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="Ej. Oferta Lote 2, tubos galvanizados, etc."
                  />
                  <p className="text-xs text-slate-500">Se añadirá junto al nombre para diferenciar propuestas del mismo proveedor.</p>
                </div>
                {summary?.quotations?.length ? (
                  <div>
                    <label className="text-sm font-medium text-slate-700">Actualizar cotización existente</label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={supplierForm.targetQuotationId}
                      onChange={event =>
                        setSupplierForm(prev => ({ ...prev, targetQuotationId: event.target.value }))
                      }
                    >
                      <option value="">Crear nueva cotización</option>
                      {summary.quotations.map(quote => (
                        <option key={quote.id} value={quote.id}>
                          {quote.supplier}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">
                      Si eliges un proveedor, sus precios y descripciones se reemplazarán con los del archivo adjunto.
                    </p>
                  </div>
                ) : null}
                <div className="rounded-lg border-2 border-sky-500 bg-sky-50 p-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sky-900">
                    <label className="text-sm font-semibold">Firmas escaneadas (máx. 3)</label>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Opcional</span>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    className="mt-2 w-full rounded-md border border-sky-400 bg-white px-3 py-2 text-sm text-sky-900 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    onChange={event => handleSignatureUpload(event.target.files)}
                  />
                  {signatureImages.length === 0 ? (
                    <p className="mt-2 text-xs text-sky-900">
                      Sube una o varias firmas digitalizadas y arrástralas en la vista previa para ubicarlas donde corresponda.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2 text-xs text-slate-600">
                      {signatureImages.map(image => (
                        <div
                          key={image.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                        >
                          <span className="truncate pr-3 font-medium text-slate-700">{image.name ?? 'firma.png'}</span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="text-slate-600 hover:underline"
                              onClick={() => handleSignatureCenter(image.id)}
                            >
                              Centrar
                            </button>
                            <button
                              type="button"
                              className="text-rose-600 hover:underline"
                              onClick={() => handleSignatureRemove(image.id)}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px]">Arrastra cada firma en la vista previa para ajustarla. Puedes cargar hasta 3.</p>
                    </div>
                  )}
                </div>
                {signatureError && <p className="text-xs text-rose-600">{signatureError}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Moneda de la cotización</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
                      value={supplierForm.currency}
                      onChange={e => setSupplierForm(prev => ({ ...prev, currency: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Tipo de cambio</label>
                    <input
                      type="number"
                      step="0.0001"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={supplierForm.exchangeRate}
                      onChange={e => setSupplierForm(prev => ({ ...prev, exchangeRate: e.target.value }))}
                      placeholder="3.75"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Notas</label>
                  <textarea
                    className="mt-1 h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={supplierForm.notes}
                    onChange={e => setSupplierForm(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Archivo (Excel / PDF) *</label>
                  <input
                    key={supplierFileKey}
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                    className="mt-1 w-full text-sm"
                    onChange={e => setSupplierForm(prev => ({ ...prev, file: e.target.files?.[0] ?? null }))}
                  />
                  {supplierForm.file && (
                    <button
                      type="button"
                      onClick={handleSupplierFileClear}
                      className="mt-2 text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Quitar archivo
                    </button>
                  )}
                </div>
                {supplierStatus.error && <p className="text-sm text-red-600">{supplierStatus.error}</p>}
                {supplierStatus.message && <p className="text-sm text-green-600">{supplierStatus.message}</p>}
                <button
                  type="submit"
                  className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                  disabled={supplierStatus.loading}
                >
                  {supplierStatus.loading ? 'Procesando…' : 'Importar cotización'}
                </button>
              </form>
              {summary?.quotations?.length ? (
                <div className="mt-6 space-y-2">
                  <h4 className="text-sm font-semibold text-slate-700">Cotizaciones cargadas</h4>
                  <p className="text-xs text-slate-500">Usa las etiquetas para diferenciar propuestas del mismo proveedor. Puedes eliminarlas para volver a importar.</p>
                  <div className="space-y-2">
                    {summary.quotations.map(quote => (
                      <div
                        key={`supplier-quote-${quote.id}`}
                        className="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">{quote.supplier}</p>
                          <p className="text-xs text-slate-500">{quote.currency} • {quote.items.length} ítems</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                            ID {quote.id}
                          </span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-rose-600 hover:underline"
                            onClick={() => handleDeleteSupplierQuote(quote.id)}
                            disabled={supplierDeleteId === quote.id}
                          >
                            {supplierDeleteId === quote.id ? 'Eliminando…' : 'Eliminar'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-500">Primero crea o selecciona un proceso para cargar cotizaciones.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">3. Comparativo y ranking</h3>
            {selectedProcess && (
              <p className="text-sm text-slate-500">
                {selectedProcess.name} • {selectedProcess.baseCurrency}
                {selectedProcess.code ? ` • ${selectedProcess.code}` : ''}
              </p>
            )}
          </div>
        </div>
        {summaryLoading && <p className="text-sm text-slate-500">Cargando resumen…</p>}
        {summaryError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{summaryError}</p>}
        {!summaryLoading && !summary && !summaryError && (
          <p className="text-sm text-slate-500">Selecciona un proceso para ver los resultados.</p>
        )}
        {summary && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                  mainTab === 'COMPARE'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
                onClick={() => setMainTab('COMPARE')}
              >
                Comparativo
              </button>
              <button
                type="button"
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                  mainTab === 'ANALYSIS'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
                onClick={() => setMainTab('ANALYSIS')}
              >
                Análisis
              </button>
              <button
                type="button"
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                  mainTab === 'OPS'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
                onClick={() => setMainTab('OPS')}
              >
                Gestión operativa
              </button>
            </div>

            {mainTab === 'COMPARE' && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs uppercase text-slate-500">Items base</p>
                    <p className="text-2xl font-semibold">{summary.process.baselineCount}</p>
                    <p className="text-xs text-slate-500">{formatMoney(summary.baselineTotals.cost, summary.process.baseCurrency)} valor base</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs uppercase text-slate-500">Cotizaciones</p>
                    <p className="text-2xl font-semibold">{summary.process.quotationCount}</p>
                    <p className="text-xs text-slate-500">{rankingRows.length} en ranking</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs uppercase text-slate-500">Mejor oferta</p>
                    <p className="text-lg font-semibold">{formatMoney(winnerRow?.normalizedAmount, summary.process.baseCurrency)}</p>
                    <p className="text-xs text-slate-500">{winnerRow?.supplier ?? '—'}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs uppercase text-slate-500">Variación vs base</p>
                    <p className={`text-lg font-semibold ${winnerRow?.diffAmount && winnerRow.diffAmount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {winnerRow ? formatMoney(winnerRow.diffAmount, summary.process.baseCurrency) : '—'}
                    </p>
                    <p className="text-xs text-slate-500">{winnerRow ? formatPercentDetailed(winnerRow.diffPct) : '—'}</p>
                  </div>
                </div>

                {sheetSummaryRows.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-semibold text-slate-700">Totales y cobertura por hoja</p>
                      <p className="text-xs text-slate-500">Compara el presupuesto base con lo ofrecido por cada proveedor.</p>
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-2 py-1 text-left">Hoja</th>
                            <th className="px-2 py-1 text-left">Base oficial</th>
                            {rankingRows.map(row => (
                              <th key={row.quotationId} className="px-2 py-1 text-left">
                                {row.supplier}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sheetSummaryRows.map(row => (
                            <tr key={row.sheetName} className="border-t border-slate-200">
                              <td className="px-2 py-2 font-semibold">
                                {row.sheetName}
                                <span className="block text-xs font-normal text-slate-500">
                                  {row.baseCount} ítems base
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <div className="font-medium">
                                  {formatMoney(row.baseTotal, summary.process.baseCurrency)}
                                </div>
                                <p className="text-xs text-slate-500">Presupuesto oficial</p>
                              </td>
                              {rankingRows.map(rowSupplier => {
                                const supplier = row.suppliers.find(s => s.quotationId === rowSupplier.quotationId);
                                if (!supplier || supplier.total == null) {
                                  return (
                                    <td key={`${row.sheetName}-${rowSupplier.quotationId}`} className="px-2 py-2 text-xs text-slate-500">
                                      Sin oferta
                                    </td>
                                  );
                                }
                                return (
                                  <td key={`${row.sheetName}-${rowSupplier.quotationId}`} className="px-2 py-2">
                                    <div className="font-medium">
                                      {formatMoney(supplier.total, summary.process.baseCurrency)}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      {supplier.matched}/{row.baseCount || 0} ítems
                                    </p>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!rankingRows.length && (
                      <p className="mt-2 text-xs text-slate-500">Carga una cotización para ver los montos de proveedores por hoja.</p>
                    )}
                  </div>
                )}

                <div className="space-y-4 rounded-md border border-slate-200 p-3">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Selecciona la hoja a analizar</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sheetFilterOptions.map(name => {
                          const label = name === 'ALL' ? 'Todas' : name;
                          return (
                            <button
                              key={`sheet-${name}`}
                              type="button"
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                selectedSheet === name
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-slate-300 text-slate-600 hover:border-slate-400'
                              }`}
                              onClick={() => setSelectedSheet(name)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-1 lg:max-w-xs">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Buscar material
                      </label>
                      <input
                        type="search"
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Descripción, código o palabra clave"
                        value={searchTerm}
                        onChange={event => setSearchTerm(event.target.value)}
                      />
                      <p className="text-xs text-slate-500">{filteredItems.length} coincidencias</p>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Columnas del comparativo</p>
                      <button
                        type="button"
                        className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600"
                        onClick={handleSelectAllSuppliers}
                        disabled={!rankingRows.length}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600"
                        onClick={handleSelectTopSuppliers}
                        disabled={!rankingRows.length}
                      >
                        Top 3
                      </button>
                      {supplierGroups.map(group => {
                        const selected = selectedSupplierKeys.includes(group.key);
                        return (
                          <button
                            key={`supplier-toggle-${group.key}`}
                            type="button"
                            onClick={() => handleSupplierColumnToggle(group.key)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              selected
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                            }`}
                          >
                            {group.supplier}
                            {group.variants.length > 1 && (
                              <span className="ml-1 text-[10px] font-normal opacity-80">
                                ({group.variants.length})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="overflow-auto">
                    {filteredItems.length ? (
                      <table className="min-w-full text-sm">
                        <thead className="text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-2 py-2 text-left font-semibold">Descripción</th>
                            <th className="px-2 py-2 text-left font-semibold">Base oficial</th>
                            {providerColumns.map(column => (
                              <th key={`column-${column.key}`} className="px-2 py-2 text-left font-semibold">
                                {column.supplier}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map(item => (
                            <tr key={item.baselineId} className="border-t border-slate-200 align-top">
                              <td className="px-2 py-3">
                                <p className="font-semibold text-slate-700">{item.description}</p>
                                <p className="text-xs text-slate-500">
                                  {(item.itemCode ? `${item.itemCode} • ` : '') + (item.sheetName ?? 'Sin hoja')}
                                </p>
                              </td>
                              <td className="px-2 py-3">
                                <div className="font-medium text-slate-700">
                                  {item.baseUnitPrice != null
                                    ? formatMoney(item.baseUnitPrice, summary.process.baseCurrency)
                                    : '—'}
                                </div>
                                <p className="text-xs text-slate-500">
                                  {item.baseQuantity != null ? formatQuantity(item.baseQuantity, item.unit) : '—'}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {item.baseTotalPrice != null
                                    ? formatMoney(item.baseTotalPrice, summary.process.baseCurrency)
                                    : '—'}
                                </p>
                              </td>
                              {providerColumns.map(column => {
                                const offers = column.quotationIds
                                  .map(id => item.offers.find(entry => entry.quotationId === id))
                                  .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
                                if (!offers.length) {
                                  return (
                                    <td key={`${item.baselineId}-${column.key}`} className="px-2 py-3 text-xs text-slate-500">
                                      Sin oferta
                                    </td>
                                  );
                                }
                                const sorted = [...offers].sort((a, b) => {
                                  const priceA = a.normalizedPrice ?? a.unitPrice ?? Infinity;
                                  const priceB = b.normalizedPrice ?? b.unitPrice ?? Infinity;
                                  return priceA - priceB;
                                });
                                const primary = sorted[0];
                                const additional = sorted.slice(1);
                                const unitPrice = primary.normalizedPrice ?? primary.unitPrice ?? null;
                                const totalPrice = computeOfferTotal(primary, item.baseQuantity);
                                const unitLabel = item.unit;
                                const quantityValue = primary.quantity ?? item.baseQuantity ?? null;
                                const highlight = item.bestOffer
                                  ? column.quotationIds.includes(item.bestOffer.quotationId)
                                  : false;
                                return (
                                  <td key={`${item.baselineId}-${column.key}`} className={`px-2 py-3 ${highlight ? 'bg-emerald-50/70' : ''}`}>
                                    <div className="font-semibold text-slate-700">
                                      {unitPrice != null
                                        ? formatMoney(unitPrice, summary.process.baseCurrency)
                                        : '—'}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                      {quantityValue != null ? formatQuantity(quantityValue, unitLabel) : '—'}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {totalPrice != null
                                        ? formatMoney(totalPrice, summary.process.baseCurrency)
                                        : '—'}
                                    </p>
                                    {additional.length > 0 && (
                                      <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                                        {additional.map(offer => (
                                          <p key={`${item.baselineId}-${offer.quotationId}`}>
                                            {formatMoney(offer.normalizedPrice ?? offer.unitPrice ?? null, summary.process.baseCurrency)} ·{' '}
                                            {column.variantLabels.get(offer.quotationId) ?? 'Cotización'}
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-slate-500">No se encontraron ítems que coincidan con el filtro.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {mainTab === 'ANALYSIS' && (
          <div className="space-y-5">
            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Avance por producto</p>
                  <p className="text-xs text-slate-500">
                    Seguimiento basado en las órdenes de compra y guías registradas para este proceso.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshPurchaseProgress}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400"
                  disabled={progressLoading}
                >
                  {progressLoading ? 'Actualizando…' : 'Actualizar avance'}
                </button>
              </div>
              {progressError && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{progressError}</p>
              )}
              {!progressLoading && !purchaseProgress.length && !progressError && (
                <p className="text-sm text-slate-500">
                  Aún no hay datos operativos. Guarda una orden de compra o registra una guía para comenzar el seguimiento.
                </p>
              )}
              {purchaseProgressStats && (
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Avance comprometido</p>
                    <p className="text-2xl font-semibold text-blue-700">
                      {formatPercentDetailed(purchaseProgressStats.orderedPct)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {purchaseProgressStats.itemsWithOrder}/{purchaseProgressStats.totalItems} ítems con orden
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Avance recibido</p>
                    <p className="text-2xl font-semibold text-emerald-600">
                      {formatPercentDetailed(purchaseProgressStats.receivedPct)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {purchaseProgressStats.itemsReceived}/{purchaseProgressStats.totalItems} ítems con entrega
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase text-slate-500">Ítems rastreados</p>
                    <p className="text-2xl font-semibold">{purchaseProgress.length}</p>
                    <p className="text-xs text-slate-500">Del total del expediente</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase text-slate-500">Actualizado</p>
                    <p className="text-lg font-semibold">
                      {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-xs text-slate-500">Datos operativos</p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Cobertura frente al expediente</p>
                  <p className="text-xs text-slate-500">
                    Evalúa qué tan completo está cada proveedor respecto a los ítems solicitados.
                  </p>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="w-full max-w-sm">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar proveedor</label>
                    <input
                      type="search"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Nombre o palabra clave"
                      value={coverageSearch}
                      onChange={event => setCoverageSearch(event.target.value)}
                    />
                  </div>
                  <div className="w-full max-w-[200px]">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={coverageStatusFilter}
                      onChange={event => setCoverageStatusFilter(event.target.value as 'ALL' | 'FULL' | 'PENDING')}
                    >
                      <option value="ALL">Todos</option>
                      <option value="FULL">Completos (100%)</option>
                      <option value="PENDING">Pendientes</option>
                    </select>
                  </div>
                  <p className="text-xs text-slate-500">
                    {filteredCoverageRows.length}/{supplierCoverageRows.length} proveedores visibles
                  </p>
                </div>
              </div>
              {filteredCoverageRows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2 font-semibold">Proveedor</th>
                        <th className="px-2 py-2 font-semibold">Cobertura</th>
                        <th className="px-2 py-2 font-semibold">Ítems ofertados</th>
                        <th className="px-2 py-2 font-semibold">Ítems con mejor precio</th>
                        <th className="px-2 py-2 font-semibold">Importe normalizado</th>
                        <th className="px-2 py-2 font-semibold">Ítems faltantes</th>
                      </tr>
                    </thead>
                        <tbody>
                          {filteredCoverageRows.map(row => (
                            <tr key={`coverage-${row.quotationId}`} className="border-t border-slate-100">
                          <td className="px-2 py-2 font-semibold text-slate-700">{row.supplier}</td>
                          <td className="px-2 py-2 text-sm text-slate-700">{formatPercentDetailed(row.coveragePct)}</td>
                          <td className="px-2 py-2 text-sm text-slate-600">{row.itemsMatched} ítems</td>
                          <td className="px-2 py-2 text-sm text-slate-600">
                            {row.bestItems}
                            <span className="text-xs text-slate-400"> con mejor precio</span>
                          </td>
                          <td className="px-2 py-2 text-sm text-slate-600">
                            {row.normalizedAmount != null
                              ? formatMoney(row.normalizedAmount, summary.process.baseCurrency)
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-sm text-slate-600">{row.missing ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                  <p className="text-sm text-slate-500">
                    {supplierCoverageRows.length
                      ? 'No se encontraron proveedores que coincidan con el filtro.'
                      : 'Carga al menos una cotización para visualizar la cobertura.'}
                  </p>
              )}
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-3 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Análisis individual por ítem</p>
                    <p className="text-xs text-slate-500">Controla lo comprometido y recibido por cada material.</p>
                  </div>
                  <p className="text-xs text-slate-500">{purchaseProgressDerived.length} materiales rastreados</p>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div className="w-full max-w-md">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar material</label>
                    <input
                      type="search"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Descripción, código, hoja o ID"
                      value={progressSearch}
                      onChange={event => setProgressSearch(event.target.value)}
                    />
                  </div>
                  <div className="w-full max-w-[220px]">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={progressStatusFilter}
                      onChange={event =>
                        setProgressStatusFilter(
                          event.target.value as 'ALL' | 'PENDING' | 'R0_25' | 'R25_50' | 'R50_75' | 'R75_99' | 'R100',
                        )
                      }
                    >
                      <option value="ALL">Todos</option>
                      <option value="PENDING">Pendiente</option>
                      <option value="R0_25">1% - 25%</option>
                      <option value="R25_50">26% - 50%</option>
                      <option value="R50_75">51% - 75%</option>
                      <option value="R75_99">76% - 99%</option>
                      <option value="R100">100%</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>
                      {purchaseProgressFiltered.length}/{purchaseProgressDerived.length} coincidencias
                    </span>
                    <button
                      type="button"
                      onClick={handlePrintProgress}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400"
                    >
                      Imprimir / PDF
                    </button>
                  </div>
                </div>
              </div>
              {progressLoading && !purchaseProgressDerived.length ? (
                <p className="text-sm text-slate-500">Buscando datos de avance…</p>
              ) : purchaseProgressDerived.length ? (
                purchaseProgressFiltered.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-2 font-semibold">Descripción</th>
                          <th className="px-2 py-2 font-semibold">Requerido</th>
                          <th className="px-2 py-2 font-semibold">Ordenado</th>
                          <th className="px-2 py-2 font-semibold">Recibido</th>
                          <th className="px-2 py-2 font-semibold">Pendiente</th>
                          <th className="px-2 py-2 font-semibold">Avance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseProgressFiltered.map((item, index) => {
                          const sheetLabel =
                            item.sheetNames?.length && item.sheetNames.length > 0
                              ? item.sheetNames.join(' / ')
                              : item.sheetName ?? 'Sin hoja';
                          const rowKey = item.key ?? item.baselineId ?? `progress-${index}`;
                          return (
                          <tr key={rowKey} className="border-t border-slate-100 align-top">
                            <td className="px-2 py-3">
                              <p className="font-semibold text-slate-700">{item.description}</p>
                              <p className="text-xs text-slate-500">{sheetLabel}</p>
                            </td>
                            <td className="px-2 py-3 text-slate-700">
                              {formatQuantity(Number(item.required) || 0, item.unit)}
                            </td>
                            <td className="px-2 py-3 text-slate-700">
                              {formatQuantity(Number(item.ordered) || 0, item.unit)}
                            </td>
                            <td className="px-2 py-3 text-slate-700">
                              {formatQuantity(Number(item.received) || 0, item.unit)}
                            </td>
                            <td className="px-2 py-3 text-slate-700">
                              {formatQuantity(item.computedPendingReceive ?? (Number(item.pendingReceive) || 0), item.unit)}
                            </td>
                            <td className="px-2 py-3">
                              <div className="space-y-1">
                                <div>
                                  <p className="text-xs font-semibold uppercase text-slate-500">OC</p>
                                  <div className="h-2 w-full rounded-full bg-slate-200">
                                    <div
                                      className="h-2 rounded-full bg-blue-500"
                                      style={{ width: `${clamp01(item.computedOrderPct ?? item.orderPct ?? 0) * 100}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-slate-500">{formatPercentDetailed(item.computedOrderPct ?? item.orderPct)}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase text-slate-500">Guías</p>
                                  <div className="h-2 w-full rounded-full bg-slate-200">
                                    <div
                                      className="h-2 rounded-full bg-emerald-500"
                                      style={{ width: `${clamp01(item.computedReceivePct ?? item.receivePct ?? 0) * 100}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-slate-500">{formatPercentDetailed(item.computedReceivePct ?? item.receivePct)}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No se encontraron materiales que coincidan con el filtro.</p>
                )
              ) : (
                <p className="text-sm text-slate-500">
                  Sin avances registrados. Cuando ingreses órdenes y guías aparecerán aquí los porcentajes por ítem.
                </p>
              )}
            </div>
          </div>
        )}

        {mainTab === 'OPS' && (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            La gestión operativa se muestra debajo. Completa aquí las órdenes de compra y registra las guías.
          </p>
        )}
          </>
        )}
      </section>
      {summary && mainTab === 'OPS' && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold">4. Gestión operativa</h3>
              <p className="text-sm text-slate-500">
                Genera órdenes oficiales y registra las guías para mantener actualizado el avance.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                  operationsTab === 'ORDER'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
                onClick={() => setOperationsTab('ORDER')}
              >
                Orden de compra
              </button>
              <button
                type="button"
                className={`rounded-md border px-3 py-1 text-sm font-semibold ${
                  operationsTab === 'DELIVERY'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
                onClick={() => setOperationsTab('DELIVERY')}
              >
                Guías de remisión
              </button>
            </div>
          </div>

          {operationsTab === 'ORDER' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-md border border-slate-200 p-3 space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Proveedor adjudicado</label>
                  <input
                    list={supplierInputListId}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder={selectedPurchaseSupplier?.supplier ?? 'Escribe o selecciona un proveedor'}
                    value={purchaseSupplierInput}
                    autoComplete="off"
                    onChange={event => handleSupplierInputChange(event.target.value)}
                  />
                  <datalist id={supplierInputListId}>
                    {rankingRows.map(row => (
                      <option key={`po-supplier-${row.quotationId}`} value={row.supplier} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-slate-500">
                    Vincula la cotización escribiendo el nombre tal cual aparece en el comparativo o ingresa un proveedor
                    manual.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Logo personalizado (PNG, JPG, WebP o SVG)</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    onChange={event => handleLogoUpload(event.target.files?.[0])}
                  />
                  <p className="mt-1 text-xs text-slate-500">Si no subes nada se mostrará el isotipo predeterminado.</p>
                  {purchaseLogo?.name && (
                    <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <span className="truncate pr-3 font-medium text-slate-600">{purchaseLogo.name}</span>
                      <button type="button" className="text-rose-600 hover:underline" onClick={handleLogoReset}>
                        Quitar
                      </button>
                    </div>
                  )}
                  {purchaseLogoError && <p className="mt-1 text-xs text-rose-600">{purchaseLogoError}</p>}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">N° de orden</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={purchaseForm.orderNumber}
                      onChange={event => handlePurchaseFormChange('orderNumber', event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Fecha</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={purchaseForm.issueDate}
                      onChange={event => handlePurchaseFormChange('issueDate', event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Atención</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={purchaseForm.attention}
                    onChange={event => handlePurchaseFormChange('attention', event.target.value)}
                    placeholder="Nombre del contacto"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Motivo</label>
                  <textarea
                    className="mt-1 h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={purchaseForm.motive}
                    onChange={event => handlePurchaseFormChange('motive', event.target.value)}
                    onBlur={handleMotiveBlur}
                  />
                  {savedMotives.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Motivos guardados:</span>
                      {savedMotives.slice(0, 6).map(motive => (
                        <button
                          key={motive}
                          type="button"
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600"
                          onClick={() => handlePurchaseFormChange('motive', motive)}
                        >
                          {motive}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Detalle bajo “Lo siguiente”</label>
                  <textarea
                    className="mt-1 h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={purchaseForm.scope}
                    onChange={event => handlePurchaseFormChange('scope', event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Factura a nombre de</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={purchaseForm.invoiceName}
                    onChange={event => handlePurchaseFormChange('invoiceName', event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Dirección fiscal</label>
                  <textarea
                    className="mt-1 h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={purchaseForm.invoiceAddress}
                    onChange={event => handlePurchaseFormChange('invoiceAddress', event.target.value)}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">RUC</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={purchaseForm.invoiceRuc}
                      onChange={event => handlePurchaseFormChange('invoiceRuc', event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">IGV (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={(purchaseIgvRate * 100).toFixed(2)}
                      onChange={event => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          setPurchaseIgvRate(Math.max(0, value / 100));
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Descuento (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={(purchaseDiscountPct * 100).toFixed(2)}
                      onChange={event => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          const pct = Math.min(100, Math.max(0, value));
                          setPurchaseDiscountPct(pct / 100);
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Firma · nombre</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={purchaseForm.signatureName}
                      onChange={event => handlePurchaseFormChange('signatureName', event.target.value)}
                      placeholder="JAIME SALAZAR ESPINOZA"
                      disabled={!purchaseForm.showManualSignature}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Firma · cargo</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={purchaseForm.signatureTitle}
                      onChange={event => handlePurchaseFormChange('signatureTitle', event.target.value)}
                      placeholder="GERENTE ADMINISTRATIVO"
                      disabled={!purchaseForm.showManualSignature}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={purchaseForm.showManualSignature}
                    onChange={event => handlePurchaseFormChange('showManualSignature', event.target.checked)}
                  />
                  Mostrar firma manual (nombre y cargo) en la orden
                </label>
              </div>
              <div className="rounded-md border border-slate-200 p-3 space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Buscar producto (base o código)</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={purchaseItemQuery}
                    onChange={event => setPurchaseItemQuery(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (purchaseItemSuggestions.length) {
                          handleAddBaselineItem(purchaseItemSuggestions[0]);
                        } else if (purchaseItemQuery.trim().length >= 2) {
                          handleCreateManualItem(purchaseItemQuery);
                        }
                      }
                    }}
                    placeholder="Ej. cable, retenida, COP-045"
                  />
                  <p className="mt-1 text-xs text-slate-500">Escribe al menos 2 caracteres. Los resultados vienen de la base importada.</p>
                </div>
                {purchaseItemSuggestions.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50">
                    {purchaseItemSuggestions.map(row => {
                      const codeLabel = normalizeItemCode(row.itemCode) ?? 'Ítem';
                      const providerDesc =
                        row.baselineId != null ? supplierOfferDescriptions.get(row.baselineId) : null;
                      return (
                      <button
                        key={`suggest-${row.baselineId}`}
                        type="button"
                        className="flex w-full items-start gap-2 border-b border-slate-200 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-white"
                        onClick={() => handleAddBaselineItem(row)}
                      >
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-700">
                          {codeLabel}
                        </span>
                        <span className="flex-1">
                          {row.description}
                          <span className="block text-[11px] text-slate-500">{row.sheetName}</span>
                          {providerDesc && (
                            <span className="block text-[11px] text-slate-500">
                              Proveedor: {providerDesc}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                    })}
                  </div>
                )}
                {purchaseSupplierId && supplierSheetNames.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Hoja del proveedor:</span>
                    <select
                      value={supplierSheetFilter}
                      onChange={event => setSupplierSheetFilter(event.target.value as 'ALL' | string)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
                    >
                      <option value="ALL">Todas las hojas</option>
                      {supplierSheetNames.map(name => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-slate-500"
                    onClick={handleAddAllFromSupplier}
                  >
                    Agregar todos del proveedor
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-slate-500"
                    onClick={() => handleCreateManualItem(purchaseItemQuery.trim() || undefined)}
                  >
                    Fila manual
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-200 px-3 py-1 text-sm text-rose-700 hover:border-rose-400"
                    onClick={handleClearPurchaseItems}
                    disabled={!purchaseItems.length}
                  >
                    Limpiar todo
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-rose-500 bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    onClick={handleResetPurchaseOrder}
                  >
                    Reiniciar orden
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-1 text-sm font-medium ${
                      sortBySupplierOrder
                        ? 'border-blue-500 text-blue-700'
                        : 'border-slate-300 text-slate-700 hover:border-slate-500'
                    }`}
                    onClick={() => setSortBySupplierOrder(value => !value)}
                  >
                    {sortBySupplierOrder ? 'Orden: proveedor' : 'Ordenar por proveedor'}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  {purchaseItems.length === 0 ? (
                    <p className="text-sm text-slate-500">Aún no hay ítems en la orden.</p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-2 py-1 text-left">#</th>
                          <th className="px-2 py-1 text-left">Descripción</th>
                          <th className="px-2 py-1 text-left">Und.</th>
                          <th className="px-2 py-1 text-left">Cantidad</th>
                          <th className="px-2 py-1 text-left">P. Unitario</th>
                          <th className="px-2 py-1 text-left">Total</th>
                          <th className="px-2 py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseItems.map((item, index) => {
                          const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                          return (
                            <tr key={item.id} className="border-t border-slate-100">
                              <td className="px-2 py-2 align-top text-xs text-slate-500">{index + 1}</td>
                              <td className="px-2 py-2 align-top">
                                <div className="space-y-2">
                                  <textarea
                                    className="h-16 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                    value={item.description}
                                    onChange={event =>
                                      handlePurchaseItemChange(item.id, 'description', event.target.value)
                                    }
                                    placeholder="Descripción base"
                                  />
                                  <textarea
                                    className="h-12 w-full rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600"
                                    value={item.providerDescription ?? ''}
                                    onChange={event =>
                                      handlePurchaseItemChange(item.id, 'providerDescription', event.target.value)
                                    }
                                    placeholder="Descripción del proveedor (opcional)"
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input
                                  type="text"
                                  className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={item.unit ?? ''}
                                  onChange={event => handlePurchaseItemChange(item.id, 'unit', event.target.value)}
                                />
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={item.quantity ?? ''}
                                  onChange={event => handlePurchaseItemChange(item.id, 'quantity', event.target.value)}
                                />
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={item.unitPrice ?? ''}
                                  onChange={event => handlePurchaseItemChange(item.id, 'unitPrice', event.target.value)}
                                />
                              </td>
                              <td className="px-2 py-2 align-top">
                                {formatMoney(lineTotal, purchaseCurrency)}
                              </td>
                              <td className="px-2 py-2 align-top text-right">
                                <button
                                  type="button"
                                  className="text-sm text-rose-600 hover:underline"
                                  onClick={() => handleRemovePurchaseItem(item.id)}
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <p className="flex justify-between"><span>Subtotal</span><span>{formatMoney(purchaseTotals.subtotal, purchaseCurrency)}</span></p>
                  {purchaseTotals.discount > 0 && (
                    <>
                      <p className="flex justify-between text-rose-600">
                        <span>Descuento ({formatPercentCompact(purchaseTotals.discountRate)})</span>
                        <span>-{formatMoney(purchaseTotals.discount, purchaseCurrency)}</span>
                      </p>
                      <p className="flex justify-between">
                        <span>Subtotal neto</span>
                        <span>{formatMoney(purchaseTotals.netSubtotal, purchaseCurrency)}</span>
                      </p>
                    </>
                  )}
                  <p className="flex justify-between"><span>IGV ({(purchaseIgvRate * 100).toFixed(2)}%)</span><span>{formatMoney(purchaseTotals.igv, purchaseCurrency)}</span></p>
                  <p className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(purchaseTotals.total, purchaseCurrency)}</span></p>
                </div>
                <div className="rounded-md border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Órdenes guardadas</h3>
                    <span className="text-xs text-slate-500">Siguiente correlativo: {nextOrderNumber || '—'}</span>
                  </div>
                  {purchaseHistoryError && (
                    <p className="text-xs text-rose-600">{purchaseHistoryError}</p>
                  )}
                  {purchaseHistoryLoading ? (
                    <p className="text-xs text-slate-500">Cargando historial…</p>
                  ) : purchaseHistory.length ? (
                    <ul className="divide-y divide-slate-200">
                      {purchaseHistory.slice(0, 6).map(order => (
                        <li key={order.id} className="py-2 text-xs text-slate-600">
                          <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                            <span>{order.orderNumber}</span>
                            <span className="text-xs text-slate-500">{formatShortDate(order.issueDate)}</span>
                          </div>
                          <p className="text-slate-600">{order.supplierName}</p>
                          <p className="text-[11px] text-slate-500">
                            {order.lines?.length || 0} ítems · {formatMoney(
                              order.total ?? order.netSubtotal ?? order.subtotal ?? 0,
                              order.currency || purchaseCurrency,
                            )}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              onClick={() => handleReusePurchaseOrder(order)}
                            >
                              Reutilizar
                            </button>
                            <button
                              type="button"
                              className="text-slate-600 hover:underline"
                              onClick={() => handleEditPurchaseOrder(order)}
                            >
                              Editar
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">Aún no guardas órdenes para este proceso.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <p>Guarda la orden antes de imprimir para que quede registrada en el historial.</p>
                {editingOrderId && (
                  <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    Editando la orden {editingOrder?.orderNumber ?? `#${editingOrderId}`}.{' '}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={handleExitPurchaseOrderEdit}
                    >
                      Salir de edición
                    </button>
                  </div>
                )}
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={handleSavePurchaseOrder}
                    disabled={purchaseSaveStatus.loading}
                    className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {purchaseSaveButtonLabel}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintPurchaseOrder}
                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Imprimir / guardar PDF
                  </button>
                </div>
                {purchaseSaveStatus.error && (
                  <p className="mt-2 text-xs text-rose-600">{purchaseSaveStatus.error}</p>
                )}
                {purchaseSaveStatus.message && !purchaseSaveStatus.error && (
                  <p className="mt-2 text-xs text-emerald-600">{purchaseSaveStatus.message}</p>
                )}
              </div>
              <PurchaseOrderPreview
                form={purchaseForm}
                supplierName={resolvedSupplierName}
                items={purchaseItems}
                currency={purchaseCurrency}
                igvRate={purchaseIgvRate}
                totals={purchaseTotals}
                logoSrc={purchaseLogo?.src}
                signatureImages={signatureImages}
                onSignaturePositionChange={
                  signatureImages.length ? handleSignaturePositionChange : undefined
                }
              />
            </div>
          </div>
          )}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3 space-y-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Registrar guía de remisión</h3>
                  <p className="text-xs text-slate-500">Actualiza el avance ingresando las cantidades entregadas.</p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-500"
                  onClick={handleAddDeliveryItem}
                >
                  Añadir ítem
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                    deliveryMode === 'ORDER'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                  onClick={() => handleDeliveryModeChange('ORDER')}
                >
                  Desde orden guardada
                </button>
                <button
                  type="button"
                  className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                    deliveryMode === 'MANUAL'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                  onClick={() => handleDeliveryModeChange('MANUAL')}
                >
                  Ingreso manual
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">N° de guía</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={deliveryDraft.guideNumber}
                    onChange={event => handleDeliveryFieldChange('guideNumber', event.target.value)}
                    placeholder="Ej. 001-123456"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Fecha</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={deliveryDraft.date}
                    onChange={event => handleDeliveryFieldChange('date', event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Proveedor</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={deliveryDraft.supplierName}
                    onChange={event => handleDeliveryFieldChange('supplierName', event.target.value)}
                    placeholder="Nombre del proveedor"
                  />
                </div>
                {deliveryMode === 'ORDER' ? (
                  <div>
                    <label className="text-sm font-medium text-slate-700">Orden asociada</label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={deliveryDraft.orderId ?? ''}
                      onChange={event => {
                        const nextOrderId = event.target.value ? Number(event.target.value) : null;
                        const hasQuantities =
                          deliveryDraft.items.length > 0 &&
                          deliveryDraft.items.some(item => Number(item.quantity) > 0);
                        if (
                          nextOrderId &&
                          deliveryDraft.orderId &&
                          deliveryDraft.orderId !== nextOrderId &&
                          hasQuantities
                        ) {
                          const ok = window.confirm(
                            'Cambiar la orden reemplazará el detalle de la guía. ¿Deseas continuar?',
                          );
                          if (!ok) return;
                          handleDeliveryOrderChange(nextOrderId, true);
                          return;
                        }
                        handleDeliveryOrderChange(nextOrderId);
                      }}
                    >
                      <option value="">Sin orden</option>
                      {purchaseHistory.map(order => (
                        <option key={`delivery-order-${order.id}`} value={order.id}>
                          {order.orderNumber} — {order.supplierName}
                        </option>
                      ))}
                    </select>
                    {selectedDeliveryOrder?.lines?.length ? (
                      <div className="mt-1 flex flex-col gap-1">
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => handleDeliveryOrderChange(deliveryDraft.orderId, true)}
                        >
                          Reemplazar con {selectedDeliveryOrder.lines.length} ítems de la orden
                        </button>
                        <p className="text-[11px] text-slate-500">
                          Al seleccionar una orden, los productos se cargan automáticamente con cantidad 0 para que ingreses lo recibido.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    No se utilizará una orden guardada. Usa el buscador inferior para añadir productos del Excel base y vincularlos al avance.
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Notas</label>
                <textarea
                  className="mt-1 h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={deliveryDraft.notes}
                  onChange={event => handleDeliveryFieldChange('notes', event.target.value)}
                  placeholder="Observaciones opcionales"
                />
              </div>
              <div>
                <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm font-semibold text-slate-700">Detalle de ítems</p>
                  {deliveryDraft.items.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:underline"
                      onClick={handleResetDeliveryDraft}
                    >
                      Limpiar ítems
                    </button>
                  )}
                </div>
                {deliveryMode === 'MANUAL' && (
                  <div className="mb-2 rounded-md border border-slate-200 p-2">
                    <label className="text-xs font-semibold text-slate-600">Buscar producto del Excel base</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      placeholder="Ej. cable, poste, COP-045"
                      value={deliveryItemQuery}
                      onChange={event => setDeliveryItemQuery(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && deliveryItemSuggestions.length) {
                          event.preventDefault();
                          handleAddDeliveryBaselineItem(deliveryItemSuggestions[0]);
                        }
                      }}
                    />
                    {deliveryItemSuggestions.length > 0 && (
                      <div className="mt-2 rounded-md border border-slate-200 bg-white">
                        {deliveryItemSuggestions.map(row => (
                          <button
                            key={`delivery-suggest-${row.baselineId}`}
                            type="button"
                            className="flex w-full items-start gap-2 border-b border-slate-100 px-2 py-1 text-left text-xs last:border-b-0 hover:bg-slate-50"
                            onClick={() => handleAddDeliveryBaselineItem(row)}
                          >
                            <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                              {normalizeItemCode(row.itemCode) ?? 'Ítem'}
                            </span>
                            <span className="flex-1">
                              {row.description}
                              <span className="block text-[10px] text-slate-500">{row.sheetName}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {deliveryDraft.items.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Usa “Añadir ítem” para registrar los productos entregados. Vincula cada fila al ítem base para medir
                    el avance.
                  </p>
                ) : (
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-2 py-1 text-left">Ítem base</th>
                          <th className="px-2 py-1 text-left">Descripción</th>
                          <th className="px-2 py-1 text-left">Unidad</th>
                          <th className="px-2 py-1 text-left">Cantidad</th>
                          <th className="px-2 py-1 text-left">Notas</th>
                          <th className="px-2 py-1 text-left" />
                        </tr>
                      </thead>
                      <tbody>
                        {deliveryDraft.items.map(item => (
                          <tr key={item.id} className="border-t border-slate-100 align-top">
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                list={deliveryBaselineListId}
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                                value={item.description}
                                onChange={event => handleDeliveryItemChange(item.id, 'description', event.target.value)}
                                onBlur={event => handleDeliveryItemDescriptionBlur(item.id, event.target.value)}
                                placeholder="Escribe o selecciona el ítem base"
                              />
                              <select
                                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600"
                                value={item.baselineId ?? ''}
                                onChange={event => handleDeliveryItemBaselineChange(item.id, event.target.value)}
                              >
                                <option value="">Vincular con el Excel base…</option>
                                {baselineOptions.slice(0, 40).map(option => (
                                  <option key={`baseline-select-${option.baselineId}`} value={option.baselineId ?? ''}>
                                    {option.description}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                value={item.description}
                                onChange={event => handleDeliveryItemChange(item.id, 'description', event.target.value)}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                value={item.unit ?? ''}
                                onChange={event => handleDeliveryItemChange(item.id, 'unit', event.target.value)}
                                placeholder="u, kg, m..."
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                step="0.01"
                                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                value={item.quantity}
                                onChange={event => handleDeliveryItemChange(item.id, 'quantity', event.target.value)}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                value={item.notes ?? ''}
                                onChange={event => handleDeliveryItemChange(item.id, 'notes', event.target.value)}
                                placeholder="Opcional"
                              />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                className="text-xs text-rose-600 hover:underline"
                                onClick={() => handleRemoveDeliveryItem(item.id)}
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <datalist id={deliveryBaselineListId}>
                      {baselineOptions.slice(0, 200).map(option => (
                        <option key={`baseline-option-${option.baselineId}`} value={option.description}>
                          {option.sheetName ? `${option.sheetName} · ${option.description}` : option.description}
                        </option>
                      ))}
                    </datalist>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveDelivery}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  disabled={deliveryStatus.loading}
                >
                  {deliveryStatus.loading ? 'Guardando…' : 'Guardar guía'}
                </button>
                <button
                  type="button"
                  onClick={handleResetDeliveryDraft}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:border-slate-500"
                >
                  Limpiar formulario
                </button>
              </div>
              {deliveryStatus.error && <p className="text-xs text-rose-600">{deliveryStatus.error}</p>}
              {deliveryStatus.message && !deliveryStatus.error && (
                <p className="text-xs text-emerald-600">{deliveryStatus.message}</p>
              )}
            </div>
            <div className="rounded-md border border-slate-200 p-3 space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Guías registradas</h3>
                  {deliveryHistoryLoading && <span className="text-xs text-slate-500">Actualizando…</span>}
                </div>
                <div className="w-full max-w-xs">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar guía</label>
                  <input
                    type="search"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Número, proveedor, orden o ítem"
                    value={deliveryHistorySearch}
                    onChange={event => setDeliveryHistorySearch(event.target.value)}
                  />
                </div>
              </div>
              {deliveryHistoryError && <p className="text-xs text-rose-600">{deliveryHistoryError}</p>}
              {deliveryHistoryFiltered.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {deliveryHistory.length === 0
                    ? 'Aún no registras guías para este proceso.'
                    : 'No se encontraron guías que coincidan con el filtro.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {deliveryHistoryFiltered.map(delivery => {
                    const totalQty = delivery.items.reduce((acc, item) => acc + (item.quantity ?? 0), 0);
                    return (
                      <li key={delivery.id} className="py-2 text-sm">
                        <div className="flex items-center justify-between text-xs uppercase text-slate-500">
                          <span>Guía {delivery.guideNumber || '—'}</span>
                          <span>{formatShortDate(delivery.date)}</span>
                        </div>
                        <p className="font-semibold text-slate-700">{delivery.supplierName}</p>
                        {delivery.orderNumber && (
                          <p className="text-xs text-slate-500">Orden: {delivery.orderNumber}</p>
                        )}
                        <p className="text-xs text-slate-500">
                          {formatQuantity(totalQty, delivery.items[0]?.unit ?? undefined)}
                        </p>
                        <ul className="mt-1 space-y-1 text-xs text-slate-600">
                          {delivery.items.slice(0, 3).map(item => (
                            <li key={item.id}>
                              {item.description} · {formatQuantity(item.quantity ?? 0, item.unit)}
                            </li>
                          ))}
                          {delivery.items.length > 3 && (
                            <li className="text-[11px] text-slate-400">y {delivery.items.length - 3} ítems más…</li>
                          )}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          {operationsTab === 'DELIVERY' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700">Registrar guía</h4>
                    <p className="text-xs text-slate-500">Ingresa los productos recibidos para actualizar el avance.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-500"
                    onClick={handleAddDeliveryItem}
                  >
                    Añadir ítem
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">N° de guía</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={deliveryDraft.guideNumber}
                      onChange={event => handleDeliveryFieldChange('guideNumber', event.target.value)}
                      placeholder="Ej. 001-123456"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Fecha</label>
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={deliveryDraft.date}
                      onChange={event => handleDeliveryFieldChange('date', event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Proveedor</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={deliveryDraft.supplierName}
                      onChange={event => handleDeliveryFieldChange('supplierName', event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Orden relacionada</label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={deliveryDraft.orderId ?? ''}
                      onChange={event => handleDeliveryFieldChange('orderId', event.target.value ? Number(event.target.value) : null)}
                    >
                      <option value="">Sin orden</option>
                      {purchaseHistory.map(order => (
                        <option key={`delivery-order-${order.id}`} value={order.id}>
                          {order.orderNumber} — {order.supplierName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Notas</label>
                  <textarea
                    className="mt-1 h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={deliveryDraft.notes}
                    onChange={event => handleDeliveryFieldChange('notes', event.target.value)}
                    placeholder="Observaciones opcionales"
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Detalle de ítems</p>
                    {deliveryDraft.items.length > 0 && (
                      <button type="button" className="text-xs text-slate-500 hover:underline" onClick={handleResetDeliveryDraft}>
                        Limpiar ítems
                      </button>
                    )}
                  </div>
                  {deliveryDraft.items.length === 0 ? (
                    <p className="text-xs text-slate-500">Añade un producto para registrar la guía.</p>
                  ) : (
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-2 py-1 text-left">Ítem base</th>
                            <th className="px-2 py-1 text-left">Descripción</th>
                            <th className="px-2 py-1 text-left">Und.</th>
                            <th className="px-2 py-1 text-left">Cantidad</th>
                            <th className="px-2 py-1 text-left">Notas</th>
                            <th className="px-2 py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {deliveryDraft.items.map(item => (
                            <tr key={item.id} className="border-t border-slate-100 align-top">
                              <td className="px-2 py-2">
                                <select
                                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                                  value={item.baselineId ?? ''}
                                  onChange={event => handleDeliveryItemBaselineChange(item.id, event.target.value)}
                                >
                                  <option value="">— Sin vincular —</option>
                                  {baselineOptions.map(option => (
                                    <option key={`baseline-${option.baselineId}`} value={option.baselineId ?? ''}>
                                      {option.description}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={item.description}
                                  onChange={event => handleDeliveryItemChange(item.id, 'description', event.target.value)}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={item.unit ?? ''}
                                  onChange={event => handleDeliveryItemChange(item.id, 'unit', event.target.value)}
                                  placeholder="u, kg, m..."
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={item.quantity}
                                  onChange={event => handleDeliveryItemChange(item.id, 'quantity', event.target.value)}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  value={item.notes ?? ''}
                                  onChange={event => handleDeliveryItemChange(item.id, 'notes', event.target.value)}
                                  placeholder="Opcional"
                                />
                              </td>
                              <td className="px-2 py-2 text-right">
                                <button
                                  type="button"
                                  className="text-xs text-rose-600 hover:underline"
                                  onClick={() => handleRemoveDeliveryItem(item.id)}
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDelivery}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    disabled={deliveryStatus.loading}
                  >
                    {deliveryStatus.loading ? 'Guardando…' : 'Guardar guía'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDeliveryDraft}
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:border-slate-500"
                  >
                    Limpiar formulario
                  </button>
                </div>
                {deliveryStatus.error && <p className="text-xs text-rose-600">{deliveryStatus.error}</p>}
                {deliveryStatus.message && !deliveryStatus.error && (
                  <p className="text-xs text-emerald-600">{deliveryStatus.message}</p>
                )}
              </div>
              <div className="rounded-md border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700">Guías registradas</h4>
                  {deliveryHistoryLoading && <span className="text-xs text-slate-500">Actualizando…</span>}
                </div>
                {deliveryHistoryError && <p className="text-xs text-rose-600">{deliveryHistoryError}</p>}
                {deliveryHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">Aún no registras guías para este proceso.</p>
                ) : (
                  <ul className="divide-y divide-slate-200">
                    {deliveryHistory.map(delivery => {
                      const totalQty = delivery.items.reduce((acc, item) => acc + (item.quantity ?? 0), 0);
                      return (
                        <li key={delivery.id} className="py-2 text-sm">
                          <div className="flex items-center justify-between text-xs uppercase text-slate-500">
                            <span>Guía {delivery.guideNumber || '—'}</span>
                            <span>{formatShortDate(delivery.date)}</span>
                          </div>
                          <p className="font-semibold text-slate-700">{delivery.supplierName}</p>
                          {delivery.orderNumber && <p className="text-xs text-slate-500">Orden: {delivery.orderNumber}</p>}
                          <p className="text-xs text-slate-500">{formatQuantity(totalQty, delivery.items[0]?.unit)}</p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-600">
                            {delivery.items.slice(0, 3).map(item => (
                              <li key={item.id}>
                                {item.description} · {formatQuantity(item.quantity ?? 0, item.unit)}
                              </li>
                            ))}
                            {delivery.items.length > 3 && (
                              <li className="text-[11px] text-slate-400">y {delivery.items.length - 3} ítems más…</li>
                            )}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
