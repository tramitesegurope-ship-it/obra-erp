import { useEffect, useState } from 'react';
import http, { listQuotationProcesses, resetQuotationProcess } from '../lib/api';
import { lockDelete, unlockDelete } from '../lib/deleteAuth';
import { useDeleteAuth } from '../hooks/useDeleteAuth';
import type { QuotationProcessListItem } from '../lib/types';

export default function SecurityPage() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const deleteUnlocked = useDeleteAuth();
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [processes, setProcesses] = useState<QuotationProcessListItem[]>([]);
  const [processLoading, setProcessLoading] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<number | ''>('');
  const [processConfirm, setProcessConfirm] = useState('');
  const [processResetStatus, setProcessResetStatus] = useState<{ loading: boolean; message?: string; error?: string }>({
    loading: false,
  });

  const loadStatus = async () => {
    try {
      const res = await http.get<{ hasPassword: boolean }>('admin/security/status');
      setHasPassword(res.hasPassword);
    } catch (error) {
      console.error(error);
      setHasPassword(false);
    }
  };

  useEffect(() => {
    loadStatus();
    loadProcesses();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.trim().length < 4) {
      setMessage('La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('La confirmación no coincide.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await http.post('admin/security/password', {
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setMessage('Contraseña guardada. Úsala al eliminar.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await loadStatus();
    } catch (error) {
      if (error instanceof Error) setMessage(error.message);
      else setMessage('No se pudo guardar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      setUnlockLoading(true);
      await unlockDelete(unlockPassword);
      setUnlockPassword('');
      setMessage('Modo eliminación activado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo desbloquear.');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleLock = () => {
    lockDelete();
    setMessage('Modo eliminación bloqueado.');
  };

  const loadProcesses = async () => {
    setProcessLoading(true);
    setProcessError(null);
    try {
      const list = await listQuotationProcesses();
      setProcesses(list);
      if (list.length && !selectedProcessId) {
        setSelectedProcessId(list[0].id);
      }
    } catch (error) {
      console.error(error);
      setProcessError('No se pudo cargar la lista de procesos.');
    } finally {
      setProcessLoading(false);
    }
  };

  const handleProcessReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deleteUnlocked) {
      setProcessResetStatus({ loading: false, error: 'Desbloquea el modo eliminación antes de continuar.' });
      return;
    }
    if (!selectedProcessId) {
      setProcessResetStatus({ loading: false, error: 'Selecciona un proceso.' });
      return;
    }
    const target = processes.find(proc => proc.id === selectedProcessId);
    if (!target) {
      setProcessResetStatus({ loading: false, error: 'Proceso no encontrado.' });
      return;
    }
    if (processConfirm.trim() !== target.name.trim()) {
      setProcessResetStatus({ loading: false, error: 'Escribe el nombre completo del proceso para confirmar.' });
      return;
    }
    const ok = window.confirm(`Esto eliminará todo el proceso "${target.name}". Esta acción no se puede deshacer.`);
    if (!ok) return;
    setProcessResetStatus({ loading: true });
    try {
      await resetQuotationProcess(target.id);
      setProcessResetStatus({
        loading: false,
        message: `Proceso "${target.name}" eliminado. Importa nuevamente la base si quieres usarlo.`,
      });
      setProcessConfirm('');
      await loadProcesses();
    } catch (error: any) {
      setProcessResetStatus({
        loading: false,
        error: error?.message ?? 'No se pudo limpiar el proceso.',
      });
    }
  };

  return (
    <div className="app-wrap space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="title">Seguridad</h1>
        <p className="subtitle">Define la contraseña para autorizar eliminaciones.</p>
      </div>
      {message && (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {message}
        </div>
      )}
      <form className="card max-w-xl space-y-4" onSubmit={handleSubmit}>
        {hasPassword ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>Contraseña actual</span>
            <input
              type="password"
              className="admin-input"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Ingresa tu contraseña actual"
            />
          </label>
        ) : (
          <p className="text-sm text-slate-600">Aún no existe una contraseña. Registra una para proteger las eliminaciones.</p>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span>Nueva contraseña</span>
          <input
            type="password"
            className="admin-input"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Nueva contraseña de eliminación"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Confirmar contraseña</span>
          <input
            type="password"
            className="admin-input"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Repite la nueva contraseña"
            required
          />
        </label>
        <button type="submit" className="admin-button admin-button--primary" disabled={loading}>
          {loading ? 'Guardando…' : hasPassword ? 'Actualizar contraseña' : 'Crear contraseña'}
        </button>
      </form>
      <form className="card max-w-xl space-y-4" onSubmit={handleUnlock}>
        <div>
          <h2 className="text-lg font-semibold text-slate-700">Modo eliminación</h2>
          <p className="text-sm text-slate-500">
            Estado actual: <strong>{deleteUnlocked ? 'Desbloqueado' : 'Bloqueado'}</strong>
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span>Contraseña de administrador</span>
          <input
            type="password"
            className="admin-input"
            value={unlockPassword}
            onChange={e => setUnlockPassword(e.target.value)}
            placeholder="Ingresa tu contraseña para activar las eliminaciones"
            required
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="admin-button admin-button--primary"
            disabled={unlockLoading}
          >
            {unlockLoading ? 'Verificando…' : 'Activar eliminaciones'}
          </button>
          {deleteUnlocked && (
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={handleLock}
            >
              Bloquear
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Mientras esté desbloqueado, los botones “Eliminar” estarán disponibles en todos los módulos.
        </p>
      </form>
      {deleteUnlocked && (
        <form className="card max-w-xl space-y-4" onSubmit={handleProcessReset}>
          <div>
            <h2 className="text-lg font-semibold text-rose-700">Resetear proceso de cotización</h2>
            <p className="text-sm text-slate-500">
              Esta acción elimina el metrado, las cotizaciones, órdenes y guías del proceso seleccionado.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span>Proceso</span>
            <select
              className="admin-input"
              value={selectedProcessId}
              onChange={event => setSelectedProcessId(event.target.value ? Number(event.target.value) : '')}
              disabled={processLoading || !processes.length}
            >
              {!processes.length && <option value="">No hay procesos disponibles</option>}
              {processes.map(proc => (
                <option key={`secure-proc-${proc.id}`} value={proc.id}>
                  {proc.name} {proc.code ? `(${proc.code})` : ''}
                </option>
              ))}
            </select>
            {processError && <span className="text-xs text-rose-600">{processError}</span>}
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={loadProcesses}
              disabled={processLoading}
            >
              {processLoading ? 'Actualizando…' : 'Actualizar lista'}
            </button>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Escribe <strong>{processes.find(proc => proc.id === selectedProcessId)?.name ?? 'el nombre completo'}</strong> para confirmar
            </span>
            <input
              type="text"
              className="admin-input"
              value={processConfirm}
              onChange={event => setProcessConfirm(event.target.value)}
              placeholder="Nombre exacto del proceso"
            />
          </label>
          <button
            type="submit"
            className="admin-button admin-button--danger"
            disabled={processResetStatus.loading || !selectedProcessId}
          >
            {processResetStatus.loading ? 'Limpiando…' : 'Eliminar proceso'}
          </button>
          {processResetStatus.error && (
            <p className="text-xs text-rose-600">{processResetStatus.error}</p>
          )}
          {processResetStatus.message && !processResetStatus.error && (
            <p className="text-xs text-emerald-600">{processResetStatus.message}</p>
          )}
        </form>
      )}
    </div>
  );
}
