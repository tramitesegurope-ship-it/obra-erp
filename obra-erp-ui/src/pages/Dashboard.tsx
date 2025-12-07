const PLACEHOLDER_CARDS = [
  { title: 'Avance físico', value: '0%', hint: 'Conecta tu módulo de valorizaciones para ver progreso en tiempo real.' },
  { title: 'Ejecución presupuestal', value: 'S/ 0.00', hint: 'Próximamente: flujo comparativo vs. plan.' },
  { title: 'Compras pendientes', value: '0 órdenes', hint: 'Actualiza el módulo de compras para ver tus compromisos.' },
];

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-slate-900">Panel de mando</h2>
        <p className="text-sm text-slate-500">Unifica indicadores de toda la obra y actúa con anticipación.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLACEHOLDER_CARDS.map(card => (
          <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-400">{card.title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800">Últimas actividades</h3>
          <p className="mt-2 text-sm text-slate-500">Aquí verás movimientos recientes de personal, compras y almacén.</p>
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
            Integra este bloque consumiendo los endpoints existentes. Nada de tus datos se modifica.
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800">Atajos frecuentes</h3>
          <div className="mt-3 grid gap-2">
            {['Registrar trabajador', 'Nueva orden de compra', 'Cargar valorización', 'Registrar alimentación'].map(item => (
              <button
                key={item}
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                onClick={() => {
                  // se enlazará en iteraciones siguientes
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
