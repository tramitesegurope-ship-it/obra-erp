import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import './index.css';
import { createRoot } from 'react-dom/client';
import App from './App';
import Admin from './pages/Admin';
import FinanceDashboard from './pages/FinanceDashboard';

const Shell = () => {
  const [route, setRoute] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const handler = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigate = useCallback((path: string) => {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    setRoute(path);
  }, []);

  const routes = useMemo(() => {
    switch (route) {
      case '/admin':
        return <Admin />;
      case '/finance':
        return <FinanceDashboard />;
      case '/':
      default:
        return <App />;
    }
  }, [route]);

  const linkClasses = (path: string) =>
    `text-sm font-semibold ${route === path ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="flex gap-3 border-b bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className={linkClasses('/')}
        >
          Obra ERP
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className={linkClasses('/admin')}
        >
          Admin
        </button>
        <button
          type="button"
          onClick={() => navigate('/finance')}
          className={linkClasses('/finance')}
        >
          Finanzas
        </button>
      </nav>
      {routes}
    </div>
  );
};

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
