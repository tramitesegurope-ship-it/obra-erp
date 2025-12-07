import { useEffect, useMemo, useState } from 'react';
import { partnerApi } from '../lib/api';
import type {
  Partner,
  PartnerLoan,
  PartnerLoanStatus,
  PartnerLoanSummary,
} from '../lib/types';

type LoanStatusFilter = 'ALL' | PartnerLoanStatus;

const STATUS_LABEL: Record<PartnerLoanStatus, string> = {
  PENDING: 'Pendiente',
  RENDIDO: 'Rendido',
  DEVUELTO: 'Devuelto',
};

const formatISODate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};

const formatDisplayDate = (value: string) =>
  new Date(value).toLocaleDateString('es-PE', { timeZone: 'UTC' });

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error ?? 'Error inesperado');

export default function PartnerLedgerPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loans, setLoans] = useState<PartnerLoan[]>([]);
  const [summary, setSummary] = useState<PartnerLoanSummary | null>(null);

  const [partnerName, setPartnerName] = useState('');

  const [loanForm, setLoanForm] = useState({
    date: formatISODate(new Date()),
    giverId: '',
    receiverId: '',
    amount: '',
    note: '',
  });

  const [filters, setFilters] = useState<{
    status: LoanStatusFilter;
    from: string;
    to: string;
  }>({
    status: 'ALL',
    from: '',
    to: '',
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const partnerOptions = useMemo(
    () => partners.map(partner => ({ value: partner.id, label: partner.name })),
    [partners],
  );

  const pendingTotals = useMemo(() => {
    if (!summary) return [];
    return summary.pendingByReceiver
      .slice()
      .sort((a, b) => b.pendingAmount - a.pendingAmount);
  }, [summary]);

  const filteredLoans = useMemo(() => {
    return loans.filter(loan => {
      if (filters.status !== 'ALL' && loan.status !== filters.status) return false;
      if (filters.from && loan.date < filters.from) return false;
      if (filters.to && loan.date > filters.to) return false;
      return true;
    });
  }, [loans, filters]);

  const loadPartners = async () => {
    try {
      const res = await partnerApi.partners.list();
      setPartners(res.items);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    }
  };

  const loadLoans = async () => {
    try {
      const res = await partnerApi.loans.list();
      setLoans(res.items);
      setSummary(res.summary);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
    }
  };

  useEffect(() => {
    loadPartners();
    loadLoans();
  }, []);

  const handleAddPartner = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = partnerName.trim();
    if (name.length < 2) {
      setMessage('Ingresa un nombre válido.');
      return;
    }
    try {
      const created = await partnerApi.partners.create({ name });
      setPartners(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setPartnerName('');
      setMessage('Socio registrado.');
    } catch (error: unknown) {
      setMessage(getErrorMessage(error) || 'No se pudo crear el socio.');
    }
  };

  const handleRenamePartner = async (partner: Partner) => {
    const next = window.prompt('Nuevo nombre del socio', partner.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length < 2) {
      setMessage('Ingresa un nombre válido.');
      return;
    }
    if (trimmed === partner.name) return;
    try {
      const updated = await partnerApi.partners.update(partner.id, { name: trimmed });
      setPartners(prev =>
        prev
          .map(item => (item.id === updated.id ? updated : item))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      );
      setMessage('Nombre actualizado.');
    } catch (error: unknown) {
      setMessage(getErrorMessage(error) || 'No se pudo actualizar el socio.');
    }
  };

  const handleCreateLoan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loanForm.giverId || !loanForm.receiverId || !loanForm.amount) {
      setMessage('Completa los campos obligatorios.');
      return;
    }
    if (loanForm.giverId === loanForm.receiverId) {
      setMessage('El socio que entrega y el que recibe deben ser distintos.');
      return;
    }
    const amount = Number(loanForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('Ingresa un monto válido.');
      return;
    }

    setLoading(true);
    try {
      await partnerApi.loans.create({
        date: loanForm.date ? `${loanForm.date}T00:00:00.000Z` : undefined,
        giverId: Number(loanForm.giverId),
        receiverId: Number(loanForm.receiverId),
        amount,
        note: loanForm.note.trim() || null,
      });
      setLoanForm({
        date: formatISODate(new Date()),
        giverId: '',
        receiverId: '',
        amount: '',
        note: '',
      });
      setMessage('Registro creado.');
      await loadLoans();
    } catch (error: unknown) {
      setMessage(getErrorMessage(error) || 'No se pudo registrar el préstamo.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeStatus = async (
    loan: PartnerLoan,
    nextStatus: PartnerLoanStatus,
  ) => {
    const payload: { status: PartnerLoanStatus; note?: string | null; financeRefs?: string[] } = {
      status: nextStatus,
    };

    if (nextStatus === 'RENDIDO') {
      const refs = window.prompt(
        'IDs de ingresos/egresos en Finanzas (separados por coma). Deja vacío si aún no tienes comprobantes.',
        loan.financeRefs.join(','),
      );
      if (refs === null) return;
      payload.financeRefs = refs
        .split(',')
        .map(text => text.trim())
        .filter(Boolean);
      const note = window.prompt('Comentario adicional (opcional).', loan.note ?? '');
      if (note === null) return;
      payload.note = note.trim() || null;
    } else if (nextStatus === 'DEVUELTO') {
      const note = window.prompt('Detalle de la devolución (opcional).', loan.note ?? '');
      if (note === null) return;
      payload.note = note.trim() || null;
    } else if (nextStatus === 'PENDING') {
      const confirm = window.confirm(
        '¿Reabrir este registro como pendiente? Se conservarán los comentarios.',
      );
      if (!confirm) return;
    }

    try {
      const updated = await partnerApi.loans.update(loan.id, payload);
      setLoans(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      await loadLoans();
      setMessage('Registro actualizado.');
    } catch (error: unknown) {
      setMessage(getErrorMessage(error) || 'No se pudo actualizar el registro.');
    }
  };

  const filteredPartners = partners.filter(partner =>
    partner.name.toLowerCase().includes(partnerName.toLowerCase()),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-800">Caja de socios</h1>
        <p className="text-sm text-slate-500">
          Control interno de préstamos entre socios y su rendición.
        </p>
      </header>

      {message && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {message}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-700">Registrar movimiento</h2>
          <form className="grid gap-3" onSubmit={handleCreateLoan}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Fecha
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={loanForm.date}
                  onChange={event =>
                    setLoanForm(prev => ({ ...prev, date: event.target.value }))
                  }
                />
              </label>
              <label className="text-sm text-slate-600">
                Monto (S/)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={loanForm.amount}
                  onChange={event =>
                    setLoanForm(prev => ({ ...prev, amount: event.target.value }))
                  }
                  required
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Socio que entrega
                <select
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={loanForm.giverId}
                  onChange={event =>
                    setLoanForm(prev => ({ ...prev, giverId: event.target.value }))
                  }
                  required
                >
                  <option value="">Selecciona socio</option>
                  {partnerOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Socio que recibe
                <select
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={loanForm.receiverId}
                  onChange={event =>
                    setLoanForm(prev => ({ ...prev, receiverId: event.target.value }))
                  }
                  required
                >
                  <option value="">Selecciona socio</option>
                  {partnerOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-sm text-slate-600">
              Nota (opcional)
              <textarea
                className="mt-1 min-h-[80px] w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={loanForm.note}
                onChange={event =>
                  setLoanForm(prev => ({ ...prev, note: event.target.value }))
                }
                placeholder="Describe el motivo o condiciones del préstamo."
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-700">Socios</h2>
          <form className="mb-3 flex gap-2" onSubmit={handleAddPartner}>
            <input
              type="text"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Nombre del socio"
              value={partnerName}
              onChange={event => setPartnerName(event.target.value)}
            />
            <button
              type="submit"
              className="rounded border border-blue-500 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              Agregar
            </button>
          </form>
          <ul className="space-y-2">
            {filteredPartners.map(partner => (
              <li
                key={partner.id}
                className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
              >
                <span>{partner.name}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-600 hover:underline"
                  onClick={() => handleRenamePartner(partner)}
                >
                  Renombrar
                </button>
              </li>
            ))}
            {!filteredPartners.length && (
              <li className="rounded border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                No hay socios con ese criterio.
              </li>
            )}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-700">Resumen de préstamos</h2>
          <ul className="space-y-2">
            {pendingTotals.length ? (
              pendingTotals.map(item => (
                <li
                  key={item.partnerId}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>{item.partnerName}</span>
                  <strong className="text-slate-800">{formatMoney(item.pendingAmount)}</strong>
                </li>
              ))
            ) : (
              <li className="rounded border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                Sin préstamos pendientes por rendir.
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Estado</label>
              <select
                className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
                value={filters.status}
                onChange={event =>
                  setFilters(prev => ({ ...prev, status: event.target.value as LoanStatusFilter }))
                }
              >
                <option value="ALL">Todos</option>
                <option value="PENDING">Pendientes</option>
                <option value="RENDIDO">Rendidos</option>
                <option value="DEVUELTO">Devueltos</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Desde</label>
              <input
                type="date"
                className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
                value={filters.from}
                onChange={event => setFilters(prev => ({ ...prev, from: event.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">Hasta</label>
              <input
                type="date"
                className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
                value={filters.to}
                onChange={event => setFilters(prev => ({ ...prev, to: event.target.value }))}
              />
            </div>
            <button
              type="button"
              className="ml-auto rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              onClick={() =>
                setFilters({
                  status: 'ALL',
                  from: '',
                  to: '',
                })
              }
            >
              Limpiar filtros
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Entrega</th>
                  <th className="px-3 py-2 text-left">Recibe</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Notas</th>
                  <th className="px-3 py-2 text-left">Vínculos</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map(loan => (
                  <tr key={loan.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">{formatDisplayDate(loan.date)}</td>
                    <td className="px-3 py-2 text-slate-700">{loan.giver.name}</td>
                    <td className="px-3 py-2 text-slate-700">{loan.receiver.name}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">
                      {formatMoney(loan.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          loan.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-700'
                            : loan.status === 'RENDIDO'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {STATUS_LABEL[loan.status]}
                      </span>
                      {loan.closeDate && (
                        <div className="text-[11px] text-slate-500">
                          Cerrado el {formatDisplayDate(loan.closeDate)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {loan.note ? loan.note : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {loan.financeRefs.length ? (
                        loan.financeRefs.join(', ')
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <div className="flex justify-end gap-2">
                        {loan.status !== 'PENDING' && (
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
                            onClick={() => handleChangeStatus(loan, 'PENDING')}
                          >
                            Reabrir
                          </button>
                        )}
                        {loan.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="rounded border border-green-300 px-2 py-1 text-green-700 hover:bg-green-50"
                              onClick={() => handleChangeStatus(loan, 'RENDIDO')}
                            >
                              Marcar rendido
                            </button>
                            <button
                              type="button"
                              className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
                              onClick={() => handleChangeStatus(loan, 'DEVUELTO')}
                            >
                              Marcar devuelto
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredLoans.length && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-6 text-center text-xs text-slate-500"
                    >
                      No hay movimientos con ese filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
