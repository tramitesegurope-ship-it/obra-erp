import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { adminApi, type DailyCashPayload } from '../lib/api';
import type { DailyCashExpense, DailyCashRendition, Obra } from '../lib/types';
import { useDeleteAuth } from '../hooks/useDeleteAuth';

const todayInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

const getPersonalAmount = (expense: DailyCashExpense) => {
  const value = Number(expense.personalAmount ?? 0);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return expense.paidWithPersonal ? Number(expense.amount ?? 0) : 0;
};

type DraftExpense = {
  id: string;
  description: string;
  companyAmount: string;
  personalAmount: string;
};

const createExpenseRow = (): DraftExpense => ({
  id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
  description: '',
  companyAmount: '',
  personalAmount: '',
});

type FormState = {
  date: string;
  obraId: number | '';
  openingBalance: string;
  received: string;
  notes: string;
};

const createInitialForm = (): FormState => ({
  date: todayInput(),
  obraId: '',
  openingBalance: '',
  received: '',
  notes: '',
});

export default function DailyCashPage() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [expenseRows, setExpenseRows] = useState<DraftExpense[]>([createExpenseRow()]);
  const [filterObraId, setFilterObraId] = useState<number | ''>('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [items, setItems] = useState<DailyCashRendition[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const deleteUnlocked = useDeleteAuth();
  const ensureDeleteUnlocked = () => {
    if (!deleteUnlocked) {
      window.alert('Debes desbloquear las eliminaciones en Seguridad antes de borrar rendiciones.');
      return false;
    }
    return true;
  };
  const latestBalance = useMemo(() => {
    if (items.length === 0) return 0;
    const sorted = items
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return Number(sorted[0].balance ?? 0);
  }, [items]);
  const addExpenseRow = () => setExpenseRows(prev => [createExpenseRow(), ...prev]);
  const updateExpenseRow = (id: string, patch: Partial<DraftExpense>) => {
    setExpenseRows(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeExpenseRow = (id: string) => {
    setExpenseRows(prev => {
      if (prev.length === 1) return [createExpenseRow()];
      return prev.filter(row => row.id !== id);
    });
  };
  const expensesTotal = useMemo(() => {
    return expenseRows.reduce(
      (acc, row) => {
        const companyRaw = Number(row.companyAmount);
        const personalRaw = Number(row.personalAmount);
        const company = Number.isFinite(companyRaw) && companyRaw > 0 ? companyRaw : 0;
        const personal = Number.isFinite(personalRaw) && personalRaw > 0 ? personalRaw : 0;
        const total = company + personal;
        if (total > 0) {
          acc.company += company;
          acc.personal += personal;
          acc.spent += total;
        }
        return acc;
      },
      { spent: 0, personal: 0, company: 0 },
    );
  }, [expenseRows]);

  useEffect(() => {
    api
      .get<Obra[]>('/obras')
      .then(list => {
        setObras(list);
        const defaultObra =
          list.find(obra => obra.name.trim().toLowerCase() === 'proyecto la carbonera') ??
          list[0];
        if (defaultObra) {
          setForm(prev => (prev.obraId === '' ? { ...prev, obraId: defaultObra.id } : prev));
          setFilterObraId(prev => (prev === '' ? defaultObra.id : prev));
        }
      })
      .catch(() => setObras([]));
  }, []);

  useEffect(() => {
    if (form.openingBalance.trim() !== '' && form.openingBalance !== '0.00') return;
    if (!Number.isFinite(latestBalance)) return;
    setForm(prev => ({ ...prev, openingBalance: latestBalance.toFixed(2) }));
  }, [latestBalance, form.openingBalance]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.dailyCash.list({
        obraId: typeof filterObraId === 'number' ? filterObraId : undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setItems(res.items ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [filterFrom, filterObraId, filterTo]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    if (items.length === 0) {
      return {
        opening: 0,
        received: 0,
        spent: 0,
        personal: 0,
        personalContribution: 0,
        cashFinal: 0,
        pending: 0,
      };
    }
    const ordered = items
      .slice()
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime() ||
          a.id - b.id,
      );
    const opening = Number(ordered[0].openingBalance ?? 0);
    let received = 0;
    let spent = 0;
    let personalContribution = 0;
    let personalSpent = 0;
    let pending = 0;
    for (const item of ordered) {
      received += Number(item.received ?? 0);
      const expensesTotal =
        item.expenses?.reduce((acc, exp) => acc + Number(exp.amount ?? 0), 0) ?? undefined;
      if (typeof expensesTotal === 'number') {
        spent += expensesTotal;
      } else {
        spent += Number(item.spent ?? 0);
      }
      personalContribution += Number(item.personalContribution ?? 0);
      const expensesPersonal =
        item.expenses?.reduce((acc, exp) => acc + getPersonalAmount(exp), 0) ?? 0;
      personalSpent += expensesPersonal;
      pending += Number(
        item.pendingReimbursement ?? expensesPersonal - Number(item.personalContribution ?? 0),
      );
    }
    const last = ordered[ordered.length - 1];
    const cashFinal =
      typeof last?.balance === 'number'
        ? Number(last.balance ?? 0)
        : opening + received + personalContribution - spent;
    return {
      opening,
      received,
      spent,
      personal: personalSpent,
      personalContribution,
      cashFinal,
      pending,
    };
  }, [items]);
  const trimmedOpening = form.openingBalance.trim();
  const openingAmount =
    trimmedOpening === ''
      ? Number.isFinite(latestBalance)
        ? latestBalance
        : 0
      : Number(form.openingBalance) || 0;
  const receivedAmount = Number(form.received || 0) || 0;
  const cashFinalPreview = openingAmount + receivedAmount - expensesTotal.spent;
  const previewPending = expensesTotal.personal;
  const effectiveOpening = items.length > 0 ? summary.opening : latestBalance;
  const effectiveCashFinal = items.length > 0 ? summary.cashFinal : cashFinalPreview;
  const effectivePending = items.length > 0 ? summary.pending : previewPending;
  const effectivePersonalSpent = items.length > 0 ? summary.personal : expensesTotal.personal;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);
    const received = Number(form.received || 0);
    const openingInput = form.openingBalance.trim();
    const openingBalance =
      openingInput === '' ? undefined : Number(openingInput);
    if (!Number.isFinite(received) || received < 0) {
      setAlert('Ingresa un monto válido en “Monto recibido”.');
      return;
    }
    if (openingInput !== '' && !Number.isFinite(openingBalance)) {
      setAlert('Ingresa un saldo anterior válido.');
      return;
    }
    const expensesPayload = expenseRows
      .map(row => {
        const description = row.description.trim();
        const companyRaw = Number(row.companyAmount || 0);
        const personalRaw = Number(row.personalAmount || 0);
        const companyAmount =
          Number.isFinite(companyRaw) && companyRaw > 0 ? companyRaw : 0;
        const personalAmount =
          Number.isFinite(personalRaw) && personalRaw > 0 ? personalRaw : 0;
        const total = companyAmount + personalAmount;
        return {
          description,
          amount: total,
          personalAmount: personalAmount > 0 ? personalAmount : undefined,
          paidWithPersonal: personalAmount > 0 ? true : undefined,
        };
      })
      .filter(item => item.description && Number.isFinite(item.amount) && item.amount > 0);
    if (expensesPayload.length === 0) {
      setAlert('Agrega al menos un gasto con descripción y monto.');
      return;
    }
    const payload: DailyCashPayload = {
      date: form.date,
      obraId: form.obraId === '' ? undefined : Number(form.obraId),
      openingBalance,
      received,
      personalContribution: undefined,
      expenses: expensesPayload,
      notes: form.notes.trim() ? form.notes.trim() : undefined,
    };
    try {
      setSaving(true);
      await adminApi.dailyCash.create(payload);
      setAlert('Rendición registrada.');
      setForm(createInitialForm());
      setExpenseRows([createExpenseRow()]);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar.';
      setAlert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!ensureDeleteUnlocked()) return;
    const ok = window.confirm('¿Eliminar esta rendición?');
    if (!ok) return;
    await adminApi.dailyCash.remove(id);
    await load();
  };

  const handlePrintReport = useCallback(() => {
    if (items.length === 0) {
      window.alert('No hay rendiciones para imprimir en el rango seleccionado.');
      return;
    }
    const obraNombre =
      typeof filterObraId === 'number'
        ? obras.find(obra => obra.id === filterObraId)?.name ?? 'Obra seleccionada'
        : 'Todas las obras';
    const rangeLabel =
      filterFrom && filterTo
        ? `Del ${filterFrom} al ${filterTo}`
        : filterFrom
          ? `Desde ${filterFrom}`
          : filterTo
            ? `Hasta ${filterTo}`
            : 'Todo el periodo';

    const sortedItems = items
      .slice()
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime() ||
          a.id - b.id,
      );

    let runningBalance =
      sortedItems.length > 0
        ? Number(sortedItems[0].openingBalance ?? 0)
        : 0;

    const rowsHtml = sortedItems
      .map(item => {
        const opening = Number(item.openingBalance ?? runningBalance);
        const entradas = Number(item.received ?? 0) + Number(item.personalContribution ?? 0);
        const salidas =
          item.expenses?.reduce((acc, exp) => acc + Number(exp.amount ?? 0), 0) ??
          Number(item.spent ?? 0);
        const closing = opening + entradas - salidas;
        const personalRow =
          item.expenses?.reduce((sum, exp) => sum + getPersonalAmount(exp), 0) ?? 0;
        const pendingRow = personalRow - Number(item.personalContribution ?? 0);
        const companyClosing = closing - pendingRow;
        runningBalance = closing;
        const notes = item.notes?.trim() ?? '';
        const gastosDetalle =
          item.expenses && item.expenses.length > 0
            ? item.expenses
                .map(exp => {
                  const personalAmount = getPersonalAmount(exp);
                  const personalLabel =
                    personalAmount > 0 ? ` (propio ${formatMoney(personalAmount)})` : '';
                  return `${exp.description} ${formatMoney(Number(exp.amount))}${personalLabel}`;
                })
                .join(' · ')
            : '';
        const detalleLines = [
          `Saldo anterior: ${formatMoney(opening)}`,
          gastosDetalle ? `Gastos: ${gastosDetalle}` : '',
          notes ? `Nota: ${notes}` : '',
          `Saldo neto empresa: ${formatMoney(companyClosing)}`,
        ].filter(Boolean);
        const detalleHtml = detalleLines.length > 0 ? detalleLines.map(line => `<div class="detail-line">${line}</div>`).join('') : '—';

        return `<tr>
          <td>${new Date(item.date).toLocaleDateString('es-PE')}</td>
          <td>Caja chica — Rendición #${item.id}</td>
          <td>${detalleHtml}</td>
          <td class="numeric">${formatMoney(entradas)}</td>
          <td class="numeric">${formatMoney(salidas)}</td>
          <td class="numeric ${closing < 0 ? 'neg' : ''}">${formatMoney(closing)}</td>
        </tr>`;
      })
      .join('');

    const totals = sortedItems.reduce(
      (acc, item) => {
        acc.received += Number(item.received ?? 0);
        const expensesTotal =
          item.expenses?.reduce((sum, exp) => sum + Number(exp.amount ?? 0), 0) ?? undefined;
        if (typeof expensesTotal === 'number') {
          acc.spent += expensesTotal;
        } else {
          acc.spent += Number(item.spent ?? 0);
        }
        const personalSpent =
          item.expenses?.reduce((sum, exp) => sum + getPersonalAmount(exp), 0) ?? 0;
        acc.personal += personalSpent;
        acc.pending += Number(
          item.pendingReimbursement ?? personalSpent - Number(item.personalContribution ?? 0),
        );
        return acc;
      },
      { received: 0, spent: 0, personal: 0, pending: 0 },
    );
    const opening = sortedItems.length > 0 ? Number(sortedItems[0].openingBalance ?? 0) : 0;
    const finalBalance =
      sortedItems.length > 0
        ? Number(
            sortedItems[sortedItems.length - 1].balance ??
              opening + totals.received + totals.personal - totals.spent,
          )
        : 0;
    const companyNet = finalBalance - totals.pending;
    const cards = {
      opening,
      received: totals.received,
      spent: totals.spent,
      personal: totals.personal,
      finalCash: finalBalance,
      companyNet,
      pending: totals.pending,
    };

    const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Rendición diaria</title>
    <style>
      @media print {
        body { margin: 0; }
      }
      body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
      .wrap { max-width: 960px; margin: 0 auto; }
      h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.02em; }
      p.meta { margin: 0; color: #475569; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; }
      th { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; background: #f8fafc; }
      .numeric { text-align: right; font-variant-numeric: tabular-nums; }
      .resume { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
      .card { padding: 14px 16px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .card span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
      .card strong { display: block; font-size: 16px; margin-top: 4px; color: #0f172a; }
      .note { display: block; font-size: 11px; margin-top: 4px; color: #475569; }
      .neg { color: #dc2626; }
      .pos { color: #15803d; }
      .detail-line { font-size: 11px; color: #475569; margin-bottom: 4px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Rendición diaria</h1>
      <p class="meta"><strong>Obra:</strong> ${obraNombre} · <strong>Período:</strong> ${rangeLabel}</p>
      <div class="resume">
        <div class="card">
          <span>Saldo anterior</span>
          <strong>${formatMoney(cards.opening)}</strong>
        </div>
        <div class="card">
          <span>Recibido total</span>
          <strong>${formatMoney(cards.received)}</strong>
        </div>
        <div class="card">
          <span>Gastado total</span>
          <strong>${formatMoney(cards.spent)}</strong>
        </div>
        <div class="card">
          <span>Dinero propio</span>
          <strong>${formatMoney(cards.personal)}</strong>
        </div>
        <div class="card">
          <span>Saldo total</span>
          <strong class="${cards.companyNet < 0 ? 'neg' : 'pos'}">${formatMoney(cards.companyNet)}</strong>
          <small class="note ${cards.companyNet < 0 ? 'neg' : 'pos'}">
            ${cards.companyNet >= 0 ? 'Saldo a favor (empresa)' : 'Empresa debe reembolsar'}
          </small>
          <small class="note">Caja física: ${formatMoney(cards.finalCash)}</small>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Detalle</th>
            <th>Entradas</th>
            <th>Salidas</th>
            <th>Saldo en caja</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.alert('No se pudo abrir la ventana de impresión. Revisa el bloqueador emergente.');
      return;
    }
    const doc = printWindow.document;
    doc.open('text/html', 'replace');
    doc.write(html);
    doc.close();
    const trigger = () => printWindow.print();
    if (doc.readyState === 'complete') trigger();
    else doc.addEventListener('DOMContentLoaded', trigger, { once: true });
  }, [items, obras, filterObraId, filterFrom, filterTo, formatMoney, load]);

  return (
    <div className="app-wrap">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="title">Rendición diaria</h1>
          <p className="subtitle">Registra ingresos y gastos de caja chica por día.</p>
        </div>
      </div>

      <div className="kpis mt-4">
        <div>
          <span>Saldo anterior</span>
          <strong>{formatMoney(effectiveOpening)}</strong>
          <small className="block text-[11px] text-slate-400">
            Saldo con el que iniciaste el período filtrado
          </small>
        </div>
        <div>
          <span>Recibido total</span>
          <strong>{formatMoney(summary.received)}</strong>
          <small className="block text-[11px] text-slate-400">Efectivo entregado por la empresa</small>
        </div>
        <div>
          <span>Gastado total</span>
          <strong>{formatMoney(summary.spent)}</strong>
          <small className="block text-[11px] text-slate-400">Suma de todos los gastos del periodo</small>
        </div>
        <div>
          <span>Dinero propio</span>
          <strong>{formatMoney(effectivePersonalSpent)}</strong>
          <small className="block text-[11px] text-slate-400">Pagado con tu dinero</small>
        </div>
        <div>
          <span>Saldo total</span>
          <strong className={effectiveCashFinal < 0 ? 'text-rose-600' : 'text-emerald-700'}>
            {formatMoney(effectiveCashFinal)}
          </strong>
          <small className="block text-[11px] text-slate-400">
            {effectiveCashFinal >= 0 ? 'Saldo a favor de caja' : 'Empresa te debe reembolsar'}
          </small>
          {effectivePending !== 0 && (
            <small className="mt-1 block text-[11px] text-slate-400">
              Pendiente: {formatMoney(effectivePending)} ·{' '}
              {effectivePending > 0 ? 'Empresa te debe' : 'Debes reponer'}
            </small>
          )}
        </div>
      </div>
      {effectivePending !== 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Pendiente de reembolso:{' '}
          <span className={effectivePending > 0 ? 'text-emerald-600' : 'text-rose-600'}>
            {formatMoney(effectivePending)}
          </span>{' '}
          · {effectivePending > 0 ? 'Saldo a favor (empresa te debe)' : 'Saldo en contra (debes reponer)'}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(900px,1fr)]">
        <form className="card space-y-4" onSubmit={handleSubmit}>
          <div className="border-b border-slate-200 pb-2">
            <h2 className="text-lg font-semibold text-slate-700">Registrar rendición</h2>
            <p className="text-xs text-slate-500">Dinero recibido y gastado en el día.</p>
          </div>
          {alert && <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{alert}</div>}
          <label className="flex flex-col gap-1 text-sm">
            <span>Fecha</span>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
              className="admin-input"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Saldo anterior (S/)</span>
            <input
              type="number"
              step="0.01"
              value={form.openingBalance}
              onChange={e => setForm(prev => ({ ...prev, openingBalance: e.target.value }))}
              className="admin-input"
              placeholder="Saldo final de la rendición anterior"
            />
            <small className="text-[11px] text-slate-400">Si dejas vacío, usamos el último saldo registrado.</small>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Obra (opcional)</span>
            <select
              value={form.obraId === '' ? '' : String(form.obraId)}
              onChange={(e) => {
                const value = e.target.value;
                setForm(prev => ({ ...prev, obraId: value ? Number(value) : '' }));
              }}
              className="admin-input"
            >
              <option value="">Sin obra específica</option>
              {obras.map(obra => (
                <option key={obra.id} value={obra.id}>{obra.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Monto recibido (S/)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.received}
              onChange={e => setForm(prev => ({ ...prev, received: e.target.value }))}
              className="admin-input"
              required
            />
          </label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
              <span className="text-sm font-semibold text-slate-700">Gastos del día</span>
                <p className="text-xs text-slate-400">Escribe el concepto y debajo el monto.</p>
              </div>
              <button type="button" className="text-xs font-semibold text-blue-600 hover:underline" onClick={addExpenseRow}>
                + Agregar gasto
              </button>
            </div>
            <div className="space-y-3">
              {expenseRows.map(row => (
                <div
                  key={row.id}
                  className="mx-auto w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm transition hover:border-slate-300 space-y-3"
                >
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Concepto</label>
                    <input
                      type="text"
                      className="admin-input mt-1"
                      placeholder="Ej. Desayuno, hotel, herramienta…"
                      value={row.description}
                      onChange={e => updateExpenseRow(row.id, { description: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex flex-1 flex-col">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Monto empresa <span className="font-normal normal-case text-[10px] text-slate-400">(S/)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="admin-input mt-1 w-full text-base font-semibold tabular-nums sm:max-w-[260px]"
                        placeholder="S/ 0.00"
                        value={row.companyAmount}
                        onChange={e => updateExpenseRow(row.id, { companyAmount: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Dinero propio <span className="ml-1 font-normal normal-case text-[10px] text-slate-400">(S/)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="admin-input mt-1 w-full text-sm tabular-nums sm:max-w-[260px]"
                        placeholder="S/ 0.00"
                        value={row.personalAmount}
                        onChange={e => updateExpenseRow(row.id, { personalAmount: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end justify-end sm:pl-4">
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline whitespace-nowrap"
                        onClick={() => removeExpenseRow(row.id)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <span>Total gastos: <strong className="text-slate-900">{formatMoney(expensesTotal.spent)}</strong></span>
              <span>Pagado con dinero propio: <strong className="text-slate-900">{formatMoney(expensesTotal.personal)}</strong></span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Flujo diario</p>
              <div className="flex flex-col gap-1">
                <div>Saldo anterior: <strong>{formatMoney(openingAmount)}</strong></div>
                <div>+ Recibido: <strong>{formatMoney(receivedAmount)}</strong></div>
                <div>- Gastos del día: <strong>{formatMoney(expensesTotal.spent)}</strong></div>
                <div className={`text-base font-semibold ${cashFinalPreview < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  = Saldo final estimado: {formatMoney(cashFinalPreview)}
                </div>
                {previewPending !== 0 && (
                  <div className={`text-sm font-semibold ${previewPending > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {previewPending > 0
                      ? `Empresa te debe: ${formatMoney(previewPending)}`
                      : `Debes reponer: ${formatMoney(Math.abs(previewPending))}`}
                  </div>
                )}
                <div className="text-[11px] text-slate-500">
                  De ese total, {formatMoney(expensesTotal.personal)} los cubriste tú.
                </div>
              </div>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span>Notas / detalle</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              className="admin-input"
              placeholder="Ej. Compras de ferretería sin comprobante"
            />
          </label>
          <button type="submit" className="admin-button admin-button--primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar rendición'}
          </button>
        </form>

        <div className="card space-y-3 shadow-lg min-w-[950px]">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 pb-2 text-sm">
            <label className="flex flex-col gap-1 text-xs text-slate-500 min-w-[400px]">
              <span>Obra</span>
              <select
                className="admin-input"
                value={filterObraId === '' ? '' : String(filterObraId)}
                onChange={(e) => {
                  const value = e.target.value;
                  setFilterObraId(value ? Number(value) : '');
                }}
              >
                <option value="">Todas</option>
                {obras.map(obra => (
                  <option key={obra.id} value={obra.id}>{obra.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>Desde</span>
              <input type="date" className="admin-input" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>Hasta</span>
              <input type="date" className="admin-input" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            </label>
            <div className="flex items-center gap-2">
              <button type="button" className="admin-button admin-button--ghost" onClick={load} disabled={loading}>
                {loading ? 'Actualizando…' : 'Actualizar'}
              </button>
              <button
                type="button"
                className="admin-button admin-button--ghost"
                onClick={handlePrintReport}
              >
                Imprimir reporte
              </button>
            </div>
          </div>

          <div className="table-shell overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left w-[120px]">Fecha</th>
                  <th className="px-3 py-2 text-right">Recibido</th>
                  <th className="px-3 py-2 text-right">Gastado</th>
                  <th className="px-3 py-2 text-right">Dinero propio</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2 text-left w-[500px]">Detalle</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-500">Cargando…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-500">Sin rendiciones en el rango seleccionado.</td></tr>
                ) : (
                  items.map(item => {
                    const personalContribution = Number(item.personalContribution ?? 0);
                    const personalSpent =
                      item.expenses?.reduce((acc, exp) => acc + getPersonalAmount(exp), 0) ?? 0;
                    const pending = Number(
                      item.pendingReimbursement ?? personalSpent - personalContribution,
                    );
                    const balance = Number(item.balance ?? 0);
                    const spentValue =
                      item.expenses?.reduce((acc, exp) => acc + Number(exp.amount ?? 0), 0) ??
                      Number(item.spent ?? 0);
                    const balanceLabel = balance >= 0 ? 'Caja física' : 'Caja en negativo';
                    const pendingLabel =
                      pending > 0
                        ? 'Saldo a favor (empresa te debe)'
                        : pending < 0
                          ? 'Saldo en contra (debes reponer)'
                          : 'Sin diferencias';

                    return (
                      <tr key={item.id} className="align-top border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-3 py-3 text-sm text-slate-600 whitespace-nowrap">{new Date(item.date).toLocaleDateString('es-PE')}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-700">{formatMoney(Number(item.received ?? 0))}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatMoney(spentValue)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatMoney(personalSpent)}</td>
                        <td className={`px-3 py-3 text-right tabular-nums ${pending !== 0 ? (pending > 0 ? 'text-emerald-600' : 'text-rose-600') : ''}`}>
                          {formatMoney(pending)}
                          <div className="text-[11px] font-medium text-slate-400">{pendingLabel}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <div className={`${balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {formatMoney(balance)}
                            <div className="text-[11px] font-medium text-slate-400">{balanceLabel}</div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-600 align-top break-words">
                          {item.expenses && item.expenses.length > 0 ? (
                            <ul className="space-y-1">
                              {item.expenses.map(exp => {
                                const personalAmount = getPersonalAmount(exp);
                                return (
                                  <li key={exp.id} className="flex items-center justify-between gap-3">
                                    <span className="font-medium text-slate-700">{exp.description}</span>
                                    <span className="tabular-nums font-semibold text-slate-800">
                                      {formatMoney(Number(exp.amount))}
                                      {personalAmount > 0 && (
                                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] uppercase text-blue-700">
                                          Propio {formatMoney(personalAmount)}
                                        </span>
                                      )}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                          {item.notes && (
                            <p className="mt-2 rounded bg-slate-100 px-3 py-2 text-xs text-slate-500">
                              Nota: {item.notes}
                            </p>
                          )}
                          <div className="mt-3 rounded-xl bg-slate-100 px-3 py-3 text-sm text-slate-700">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span>Saldo anterior: <strong>{formatMoney(Number(item.openingBalance ?? 0))}</strong></span>
                              <span>+ Recibí: <strong>{formatMoney(Number(item.received ?? 0))}</strong></span>
                              <span>+ Aporte personal: <strong>{formatMoney(personalContribution)}</strong></span>
                              <span>- Gasté: <strong>{formatMoney(spentValue)}</strong></span>
                              <span className={`text-base font-semibold ${balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                = Saldo final: {formatMoney(balance)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              {pending !== 0 && (
                                <span className={pending > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                                  {pending > 0
                                    ? `Empresa te debe: ${formatMoney(pending)}`
                                    : `Debes reponer: ${formatMoney(Math.abs(pending))}`}
                                </span>
                              )}
                              {personalSpent > 0 && (
                                <span>Pagaste {formatMoney(personalSpent)} con tu dinero.</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              className={`text-xs ${deleteUnlocked ? 'text-rose-600 hover:underline' : 'text-slate-400 cursor-not-allowed opacity-60'}`}
                              onClick={() => handleDelete(item.id)}
                              disabled={!deleteUnlocked}
                              title={deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar'}
                            >
                              Eliminar
                            </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
