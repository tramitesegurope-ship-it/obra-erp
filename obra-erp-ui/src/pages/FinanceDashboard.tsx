import { useEffect, useMemo, useState } from 'react';
import { financeApi } from '../lib/api';
import type { FinanceBudgetResponse, FinancePerformanceResponse } from '../lib/api';

type TabKey = 'summary' | 'items' | 'costs' | 'performance';

const FinanceDashboard = () => {
  const [data, setData] = useState<FinanceBudgetResponse | null>(null);
  const [costReport, setCostReport] = useState<{ generatedAt: string; entries: Array<{ date: string; group: string; code?: string | null; description: string; executedQty?: number | null; materialsCost?: number; laborCost?: number; indirectFixed?: number; indirectVariable?: number; totalCost?: number }> } | null>(null);
  const [performance, setPerformance] = useState<FinancePerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [tab, setTab] = useState<TabKey>('summary');
  const formatCurrency = (value?: number | null) =>
    Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value ?? 0);

  const exportPerformanceCsv = () => {
    if (!performance) return;
    const headers = [
      'Grupo',
      'Hoja',
      'Código',
      'Descripción',
      'U.M.',
      'Presupuestado',
      'Ejecutado',
      'Cobertura %',
      'PU Presup.',
      'PU Real',
      'Variación',
      'Materiales',
      'Mano de obra',
      'Equipos',
      'Alimentación',
      'Alojamiento',
      'Logística',
      'Otros',
    ];
    const rows = performance.items.map(item => [
      item.group,
      item.sheetName ?? '',
      item.code ?? '',
      item.description,
      item.unit ?? '',
      item.budgetQty ?? '',
      item.executedQty ?? '',
      item.coverage !== null && item.coverage !== undefined ? (item.coverage * 100).toFixed(2) : '',
      item.puBudget ?? '',
      item.puReal ?? '',
      item.variance ?? '',
      item.costBreakdown.materials ?? 0,
      item.costBreakdown.labor ?? 0,
      item.costBreakdown.equipment ?? 0,
      item.costBreakdown.feeding ?? 0,
      item.costBreakdown.lodging ?? 0,
      item.costBreakdown.logistics ?? 0,
      item.costBreakdown.other ?? 0,
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `desempeno_financiero_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const fetchBudget = async (group?: string) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await financeApi.getBudget(group && group !== 'ALL' ? group : undefined);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el presupuesto.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudget();
    financeApi
      .getDailyCosts()
      .then(report => setCostReport(report))
      .catch(() => setCostReport(null));
    setPerfLoading(true);
    setPerfError(null);
    financeApi
      .getPerformance()
      .then(payload => setPerformance(payload))
      .catch(err => setPerfError(err instanceof Error ? err.message : 'No se pudo cargar el desempeño.'))
      .finally(() => setPerfLoading(false));
  }, []);

  const groups = useMemo(() => data?.summary.groups ?? [], [data]);
  const categoryEntries = useMemo(() => {
    if (!performance) return [];
    return Object.entries(performance.overall.byCategory).filter(([, value]) => value > 0);
  }, [performance]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold">Tablero financiero</h1>
        <p className="text-sm text-slate-500">
          Presupuesto base y resumen por grupo (LP, RP, RS, SFV) con opciones para analizar los ítems.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Grupo</label>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={selectedGroup || 'ALL'}
          onChange={event => {
            const value = event.target.value;
            setSelectedGroup(value);
            fetchBudget(value !== 'ALL' ? value : undefined);
          }}
        >
          <option value="ALL">Todos</option>
          {groups.map(group => (
            <option key={group.group} value={group.group}>
              {group.group}
            </option>
          ))}
        </select>

        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {data ? (
            <span>
              {data.summary.overall.count} partidas • Contractual{' '}
              {Intl.NumberFormat('es-PE').format(data.summary.overall.contractual ?? 0)}
            </span>
          ) : (
            'Sin datos'
          )}
        </div>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tab === 'summary'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600'
            }`}
            onClick={() => setTab('summary')}
          >
            Resumen
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tab === 'items'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600'
            }`}
            onClick={() => setTab('items')}
          >
            Partidas
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tab === 'costs'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600'
            }`}
            onClick={() => setTab('costs')}
          >
            Costos diarios
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tab === 'performance'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600'
            }`}
            onClick={() => setTab('performance')}
          >
            Desempeño
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando…</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {tab === 'performance' && perfLoading && <p className="text-sm text-slate-500">Calculando desempeño…</p>}
      {tab === 'performance' && perfError && <p className="text-sm text-rose-600">{perfError}</p>}

      {!loading && data && tab === 'summary' && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.summary.groups.map(group => (
            <div key={group.group} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase text-slate-500">{group.group}</div>
              <p className="text-base font-semibold">{group.count} partidas</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <dt>Contractual</dt>
                  <dd className="font-semibold text-slate-700">
                    {Intl.NumberFormat('es-PE').format(group.contractual ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt>Metrado</dt>
                  <dd className="font-semibold text-slate-700">
                    {Intl.NumberFormat('es-PE').format(group.metrado ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt>Mayores</dt>
                  <dd>{Intl.NumberFormat('es-PE').format(group.additions ?? 0)}</dd>
                </div>
                <div>
                  <dt>Deductivos</dt>
                  <dd>{Intl.NumberFormat('es-PE').format(group.deductions ?? 0)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      {!loading && data && tab === 'items' && (
        <div className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-left">Unidad</th>
                  <th className="px-3 py-2 text-right">Metrado</th>
                  <th className="px-3 py-2 text-right">Contractual</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(item => (
                  <tr key={`${item.group}-${item.code ?? item.description}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-500">{item.code}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{item.description}</td>
                    <td className="px-3 py-2 text-slate-500">{item.unit}</td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {item.qtyMetrado ?? item.qtyContractual ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {item.qtyContractual ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'costs' && costReport && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Actualizado: {new Date(costReport.generatedAt).toLocaleString()}</div>
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-right">Cant. ejecutada</th>
                  <th className="px-3 py-2 text-right">Materiales</th>
                  <th className="px-3 py-2 text-right">Mano de obra</th>
                  <th className="px-3 py-2 text-right">Indirectos</th>
                  <th className="px-3 py-2 text-right">Costo total</th>
                </tr>
              </thead>
              <tbody>
                {costReport.entries.map(entry => (
                  <tr key={`${entry.date}-${entry.code ?? entry.description}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-500">{entry.date}</td>
                    <td className="px-3 py-2 text-slate-500">{entry.code ?? '—'}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{entry.description}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{entry.executedQty ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(entry.materialsCost ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(entry.laborCost ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(
                        (entry.indirectFixed ?? 0) + (entry.indirectVariable ?? 0),
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">
                      {Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(entry.totalCost ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!perfLoading && !perfError && tab === 'performance' && performance && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={exportPerformanceCsv}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Descargar CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Imprimir / PDF
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-slate-800">Visión general</h3>
              <p className="text-xs text-slate-500">Actualizado {new Date(performance.generatedAt).toLocaleString()}</p>
              <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">Cantidad ejecutada</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {Intl.NumberFormat('es-PE').format(performance.overall.executedQty ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Costo real</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {formatCurrency(performance.overall.totalReal)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Presupuesto</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {formatCurrency(performance.overall.totalBudget)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Cobertura global</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {performance.overall.coverage !== null
                      ? `${(performance.overall.coverage * 100).toFixed(1)}%`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Variación</dt>
                  <dd
                    className={`text-lg font-semibold ${
                      (performance.overall.variance ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}
                  >
                    {performance.overall.variance !== null
                      ? formatCurrency(performance.overall.variance)
                      : '—'}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-slate-800">Composición del costo</h3>
              <div className="mt-3 space-y-1 text-sm">
                {categoryEntries.map(([category, value]) => (
                  <div key={category} className="flex items-center justify-between border-b border-slate-100 py-1">
                    <span className="text-slate-600 capitalize">{category}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(value)}</span>
                  </div>
                ))}
                {!categoryEntries.length && (
                  <p className="text-sm text-slate-500">Sin movimientos registrados.</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Partida</th>
                    <th className="px-3 py-2 text-left">Hoja / Tramo</th>
                    <th className="px-3 py-2 text-left">U.M.</th>
                    <th className="px-3 py-2 text-right">Presupuestado</th>
                    <th className="px-3 py-2 text-right">Ejecutado</th>
                    <th className="px-3 py-2 text-right">Cobertura</th>
                    <th className="px-3 py-2 text-right">PU Pres.</th>
                    <th className="px-3 py-2 text-right">PU Real</th>
                    <th className="px-3 py-2 text-right">Variación</th>
                    <th className="px-3 py-2 text-right">M.O.</th>
                    <th className="px-3 py-2 text-right">Materiales</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.items.map(item => (
                    <tr key={`${item.group}-${item.code ?? item.description}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {item.description}
                        <span className="block text-xs text-slate-500">{item.code ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{item.sheetName ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{item.unit ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {item.budgetQty ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{item.executedQty ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {item.coverage !== null && item.coverage !== undefined
                          ? `${(item.coverage * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {item.puBudget ? formatCurrency(item.puBudget) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {item.puReal ? formatCurrency(item.puReal) : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold ${
                          (item.variance ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {item.variance !== null ? formatCurrency(item.variance) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatCurrency(item.costBreakdown?.labor)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatCurrency(item.costBreakdown?.materials)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            item.status === 'COMPLETADO'
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.status === 'ALTA'
                                ? 'bg-blue-50 text-blue-700'
                                : item.status === 'MEDIA'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {performance.tramoSummary.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="text-base font-semibold text-slate-800">PU real por tramo</h4>
              <div className="mt-3 max-h-[320px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Tramo / Hoja</th>
                      <th className="px-3 py-2 text-right">Cant. ejecutada</th>
                      <th className="px-3 py-2 text-right">Costo real</th>
                      <th className="px-3 py-2 text-right">PU real</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.tramoSummary.map(row => (
                      <tr key={row.tramo} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.tramo}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{row.executedQty}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(row.totalReal)}</td>
                        <td className="px-3 py-2 text-right text-slate-900">
                          {row.puReal ? formatCurrency(row.puReal) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinanceDashboard;
