import type { ReactNode } from 'react';
import GlobalSearch from '../GlobalSearch';

type NavItem<T extends string> = {
  key: T;
  label: string;
  description: string;
};

type AppShellProps<T extends string> = {
  navItems: NavItem<T>[];
  active: T;
  onNavigate: (key: T) => void;
  searchItems: GlobalSearchItem[];
  children: ReactNode;
};

export type GlobalSearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  tag?: string;
  showOnEmpty?: boolean;
  onSelect: () => void;
};

export default function AppShell<T extends string>({
  navItems,
  active,
  onNavigate,
  searchItems,
  children,
}: AppShellProps<T>) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white/90 p-4 shadow-sm lg:flex lg:flex-col">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-slate-500">Suite de gestión</p>
          <h1 className="text-xl font-bold text-slate-900">Obra ERP</h1>
          <p className="text-xs text-slate-500">Administrador integral</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(item => {
            const isActive = item.key === active;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                className={`rounded-md px-3 py-2 text-left transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="text-xs">{item.description}</div>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto rounded-md bg-blue-50 p-3 text-xs text-blue-700">
          Optimiza tus decisiones con paneles de control, reportes y análisis predictivo. Selecciona un módulo para
          empezar.
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <GlobalSearch items={searchItems} onNavigate={key => onNavigate(key as T)} />
            <div className="hidden gap-2 lg:flex">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Ayuda
              </button>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
              >
                Acción rápida
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
