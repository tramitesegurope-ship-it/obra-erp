import { useState } from 'react';
import MovesPage from './pages/Moves';
import AdminPage from './pages/Admin';
import PersonnelPage from './pages/Personnel';
import PartnerLedgerPage from './pages/PartnerLedger';
import DailyCashPage from './pages/DailyCash';
import SecurityPage from './pages/Security';
import QuotationsPage from './pages/Quotations';
import FoodCostingPage from './pages/FoodCosting';
import DashboardPage from './pages/Dashboard';
import AppShell, { type GlobalSearchItem } from './components/layout/AppShell';

type ViewKey =
  | 'dashboard'
  | 'personnel'
  | 'moves'
  | 'admin'
  | 'quotations'
  | 'dailyCash'
  | 'partners'
  | 'security'
  | 'food';

const NAV_ITEMS: Array<{ key: ViewKey; label: string; description: string; keywords?: string[] }> = [
  { key: 'dashboard', label: 'Panel', description: 'Indicadores generales', keywords: ['home', 'inicio', 'dashboard'] },
  { key: 'personnel', label: 'Personal', description: 'RRHH y planillas', keywords: ['planillas', 'asistencia', 'rrhh'] },
  { key: 'moves', label: 'Almacén', description: 'Entradas y salidas', keywords: ['stock', 'materiales', 'inventario'] },
  { key: 'admin', label: 'Finanzas', description: 'Costos y egresos', keywords: ['finanzas', 'costos', 'egresos', 'tesorería'] },
  { key: 'quotations', label: 'Cotizaciones', description: 'Procesos y compras', keywords: ['compras', 'ordenes', 'cotización'] },
  { key: 'dailyCash', label: 'Caja diaria', description: 'Rendiciones', keywords: ['rendición', 'caja chica', 'reembolso'] },
  { key: 'partners', label: 'Caja socios', description: 'Préstamos internos', keywords: ['socios', 'préstamos', 'cash'] },
  { key: 'food', label: 'Alimentación', description: 'Costeo de raciones', keywords: ['comedor', 'alimentación', 'raciones'] },
  { key: 'security', label: 'Seguridad', description: 'Autorizaciones', keywords: ['seguridad', 'permisos', 'autorizaciones'] },
];

export default function App() {
  const [view, setView] = useState<ViewKey>('dashboard');

  const quickActions: GlobalSearchItem[] = [
    {
      id: 'action-register-worker',
      title: 'Registrar trabajador',
      subtitle: 'Ir al formulario de personal',
      keywords: ['nuevo colaborador', 'empleado', 'rrhh'],
      tag: 'Acción',
      showOnEmpty: true,
      onSelect: () => setView('personnel'),
    },
    {
      id: 'action-new-po',
      title: 'Nueva orden de compra',
      subtitle: 'Gestionar desde Cotizaciones',
      keywords: ['oc', 'orden compra', 'compra'],
      tag: 'Acción',
      showOnEmpty: true,
      onSelect: () => setView('quotations'),
    },
    {
      id: 'action-daily-cash',
      title: 'Registrar rendición diaria',
      subtitle: 'Ir al módulo de caja diaria',
      keywords: ['rendición', 'caja', 'diaria'],
      tag: 'Acción',
      showOnEmpty: true,
      onSelect: () => setView('dailyCash'),
    },
    {
      id: 'action-inventory',
      title: 'Ver existencias de almacén',
      subtitle: 'Entradas, salidas y stock',
      keywords: ['inventario', 'almacén', 'materiales'],
      tag: 'Acción',
      showOnEmpty: true,
      onSelect: () => setView('moves'),
    },
  ];

  const searchItems: GlobalSearchItem[] = [
    ...NAV_ITEMS.map(item => ({
      id: `nav-${item.key}`,
      title: item.label,
      subtitle: item.description,
      keywords: item.keywords,
      tag: 'Módulo',
      showOnEmpty: false,
      onSelect: () => setView(item.key),
    })),
    ...quickActions,
  ];

  return (
    <AppShell navItems={NAV_ITEMS} active={view} onNavigate={setView} searchItems={searchItems}>
      {view === 'dashboard' && <DashboardPage />}
      {view === 'personnel' && <PersonnelPage />}
      {view === 'moves' && <MovesPage />}
      {view === 'admin' && <AdminPage />}
      {view === 'quotations' && <QuotationsPage />}
      {view === 'dailyCash' && <DailyCashPage />}
      {view === 'partners' && <PartnerLedgerPage />}
      {view === 'security' && <SecurityPage />}
      {view === 'food' && <FoodCostingPage />}
    </AppShell>
  );
}
