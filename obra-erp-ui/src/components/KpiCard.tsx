type Props = { label: string; value: number | string; hint?: string };
export default function KpiCard({ label, value, hint }: Props) {
  return (
    <div className="admin-card admin-card--kpi">
      <p className="admin-kpi__label">{label}</p>
      <p className="admin-kpi__value tabular-nums">{value}</p>
      {hint && <p className="admin-kpi__hint">{hint}</p>}
    </div>
  );
}
