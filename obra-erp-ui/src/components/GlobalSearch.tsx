import { useEffect, useMemo, useRef, useState } from 'react';
import type { GlobalSearchItem } from './layout/AppShell';
import { MagnifyingGlassIcon } from './icons/MagnifyingGlassIcon';
import { API_BASE } from '../lib/api';

type GlobalSearchProps = {
  items: GlobalSearchItem[];
  onNavigate: (key: string) => void;
};

type GlobalSearchResponse = {
  query: string;
  purchaseOrders: Array<{
    id: number;
    processId: number;
    processName: string | null;
    processCode: string | null;
    supplierName: string;
    orderNumber: string;
    issueDate: string;
    currency?: string | null;
    total: number | null;
  }>;
  suppliers: Array<{
    id: number;
    name: string;
    ruc: string | null;
    phone: string | null;
  }>;
  quotations: Array<{
    id: number;
    processId: number;
    processName: string | null;
    processCode: string | null;
    supplierName: string | null;
    status: string;
    currency?: string | null;
    totalAmount: number | null;
  }>;
  employees: Array<{
    id: number;
    firstName: string;
    lastName: string;
    area: string;
    phone: string | null;
    documentNumber: string | null;
    accountNumber: string | null;
    cci: string | null;
  }>;
  materials: Array<{
    id: number;
    name: string;
    code: string | null;
    unit: string | null;
  }>;
};

const MONEY_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;
const formatMoney = (value?: number | null, currency?: string | null) => {
  if (value === null || value === undefined) return '—';
  const formatted = value.toLocaleString('es-PE', MONEY_FORMAT);
  if (!currency || currency === 'PEN') return `S/ ${formatted}`;
  return `${currency} ${formatted}`;
};

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-PE', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function GlobalSearch({ items, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GlobalSearchResponse | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const term = debouncedQuery;
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    params.set('limit', '5');

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/search/global?${params.toString()}`, { signal: controller.signal })
      .then(async res => {
        if (!res.ok) {
          const msg = await res.text().catch(() => '');
          throw new Error(msg || 'No se pudo buscar');
        }
        return res.json() as Promise<GlobalSearchResponse>;
      })
      .then(response => {
        if (!cancelled) {
          setData(response);
        }
      })
      .catch(error => {
        if (cancelled || error.name === 'AbortError') return;
        setError('No pudimos obtener resultados.');
        console.warn('Global search failed', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedQuery]);

  const filteredShortcuts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items.filter(item => item.showOnEmpty !== false).slice(0, 5);
    return items
      .filter(item => {
        if (item.title.toLowerCase().includes(term)) return true;
        if (item.subtitle?.toLowerCase().includes(term)) return true;
        return item.keywords?.some(keyword => keyword.toLowerCase().includes(term));
      })
      .slice(0, 6);
  }, [items, query]);

  const closeSearch = () => {
    setQuery('');
    setOpen(false);
  };

  const handleSelectShortcut = (item: GlobalSearchItem) => {
    item.onSelect();
    closeSearch();
  };

  const handleNavigate = (destination: string) => {
    onNavigate(destination);
    closeSearch();
  };

  const renderSectionTitle = (label: string) => (
    <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
  );

  const hasRecords = useMemo(() => {
    if (!data) return false;
    return (
      data.purchaseOrders.length +
        data.suppliers.length +
        data.quotations.length +
        data.employees.length +
        data.materials.length >
      0
    );
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 rounded-full border border-slate-200 bg-slate-100 px-3 py-2 transition focus-within:border-blue-300 focus-within:bg-white"
    >
      <label className="flex items-center gap-3">
        <MagnifyingGlassIcon className="h-4 w-4 text-slate-400" />
        <input
          type="search"
          className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          placeholder="Buscar órdenes, proveedores, cajas, personal…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={event => setQuery(event.target.value)}
          onBlur={event => {
            if (!containerRef.current?.contains(event.relatedTarget as Node)) {
              setOpen(false);
            }
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && filteredShortcuts[0] && (!data || !hasRecords)) {
              event.preventDefault();
              handleSelectShortcut(filteredShortcuts[0]);
            }
          }}
        />
      </label>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[480px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
          {loading && <div className="px-4 py-3 text-sm text-slate-500">Buscando…</div>}
          {!loading && error && <div className="px-4 py-3 text-sm text-red-600">{error}</div>}
          {!loading && !error && data && (
            <div className="divide-y divide-slate-100">
              {data.purchaseOrders.length > 0 && (
                <div>
                  {renderSectionTitle('Órdenes de compra')}
                  <ul>
                    {data.purchaseOrders.map(order => (
                      <li key={`po-${order.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleNavigate('quotations')}
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">OC {order.orderNumber}</p>
                            <p className="text-xs text-slate-500">{order.supplierName}</p>
                            <p className="text-xs text-slate-500">
                              {formatDate(order.issueDate)} · {formatMoney(order.total, order.currency)}
                            </p>
                          </div>
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                            OC
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.suppliers.length > 0 && (
                <div>
                  {renderSectionTitle('Proveedores')}
                  <ul>
                    {data.suppliers.map(supplier => (
                      <li key={`supplier-${supplier.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleNavigate('admin')}
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{supplier.name}</p>
                            <p className="text-xs text-slate-500">
                              {supplier.ruc ? `RUC ${supplier.ruc}` : 'Sin RUC'} · {supplier.phone ?? 'Sin teléfono'}
                            </p>
                          </div>
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Proveedor
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.quotations.length > 0 && (
                <div>
                  {renderSectionTitle('Cotizaciones')}
                  <ul>
                    {data.quotations.map(quotation => (
                      <li key={`quotation-${quotation.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleNavigate('quotations')}
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{quotation.processName ?? 'Proceso'}</p>
                            <p className="text-xs text-slate-500">
                              {quotation.supplierName ?? 'Proveedor sin nombre'} · {quotation.status}
                            </p>
                            <p className="text-xs text-slate-500">{formatMoney(quotation.totalAmount, quotation.currency)}</p>
                          </div>
                          <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                            Cotización
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.employees.length > 0 && (
                <div>
                  {renderSectionTitle('Personal registrado')}
                  <ul>
                    {data.employees.map(employee => (
                      <li key={`employee-${employee.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleNavigate('personnel')}
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{`${employee.lastName} ${employee.firstName}`}</p>
                            <p className="text-xs text-slate-500">
                              {employee.documentNumber ?? 'Sin documento'} · {employee.area}
                            </p>
                            {employee.phone && <p className="text-xs text-slate-500">{employee.phone}</p>}
                          </div>
                          <span className="rounded-md bg-green-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                            Personal
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.materials.length > 0 && (
                <div>
                  {renderSectionTitle('Materiales y almacén')}
                  <ul>
                    {data.materials.map(material => (
                      <li key={`material-${material.id}`}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleNavigate('moves')}
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{material.name}</p>
                            <p className="text-xs text-slate-500">
                              {material.code ? `Código ${material.code}` : 'Sin código'} · {material.unit ?? 'U'}
                            </p>
                          </div>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            Material
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!hasRecords && <div className="px-4 py-3 text-sm text-slate-500">No encontramos coincidencias.</div>}

              {filteredShortcuts.length > 0 && (
                <div>
                  {renderSectionTitle('Atajos y módulos')}
                  <ul>
                    {filteredShortcuts.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleSelectShortcut(item)}
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{item.title}</p>
                            {item.subtitle && <p className="text-xs text-slate-500">{item.subtitle}</p>}
                          </div>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                            {item.tag ?? 'Acción'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
