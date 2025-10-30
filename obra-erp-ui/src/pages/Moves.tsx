/*cspell:disable*/
import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import type { MoveType, Obra, Material, Proveedor, Frente, Move, MoveCreate, MoveCreated } from '../lib/types';


type Opt = { value: number; label: string };
type MovesListResponse = Move[] | { items?: Move[] };
type StockRow = { materialId: number; stock: number };
type DraftState = {
  materialName: string;
  quantity: string;
  unit: string;
  unitCost: string;
  note: string;
  proveedorName: string;
};

const createEmptyDraft = (): DraftState => ({
  materialName: '',
  quantity: '',
  unit: '',
  unitCost: '',
  note: '',
  proveedorName: '',
});

// ---------- Catálogos “base” para autocompletar ----------
const UNIT_OPTIONS = [
  'unidad','kg','g','ton','m','m²','m³','lt','galón','bolsa','saco','par','juego','paquete','rollo','barra','plancha','tubo','cajón',
].sort((a,b)=>a.localeCompare(b,'es'));

const PRESET_FRENTES = ['Frente Centro', 'Frente Norte', 'Frente Sur', 'Frente Este', 'Frente Oeste'];

const PRESET_MATS = [
  'Agregado grueso (piedra chancada)', 'Agregado fino (arena)', 'Aislador',
  'Alambre recocido', 'Asfalto', 'Azulejo',
  'Cables THHN #12', 'Cables THHN #10', 'Cables de aluminio', 'Canaleta PVC',
  'Carretilla', 'Cemento Portland tipo I', 'Cemento Rápido', 'Cerámica piso',
  'Concreto premezclado', 'Conduit EMT 1/2"', 'Conduit EMT 3/4"', 'Conduit PVC 1/2"',
  'Conector mecánico', 'Curado de concreto',
  'Diesel', 'Disyuntor termomagnético', 'Encofrado (tablero fenólico)',
  'Escalerilla cable tray', 'Estructura metálica', 'Ferretería miscelánea',
  'Fierro corrugado 1/2"', 'Fierro corrugado 3/8"', 'Fierro corrugado 5/8"',
  'Geotextil', 'Grava', 'Hormigón ciclópeo',
  'Imprimante asfáltico', 'Interruptor', 'Ladrillo king kong', 'Ladrillo pandereta',
  'Luminaria LED calle', 'Madera 2x4', 'Mezcla asfáltica en caliente',
  'Mortero (cemento + arena)', 'Pintura látex', 'Pintura epóxica',
  'Planchas de acero', 'Planchas de drywall', 'Planchas OSB',
  'Poste de concreto', 'Poste metálico', 'Puente grúa (servicio)',
  'Red de puesta a tierra', 'Rollo cable triplex', 'Señalización vial', 'Soldadura (electrodo)',
  'Tablero eléctrico', 'Tubería HDPE 2"', 'Tubería PVC 2"', 'Tubería galvanizada 1"',
  'Válvulas', 'Yeso',
].sort((a,b)=>a.localeCompare(b,'es'));

const PRESET_PROV = [
  'Aceros Arequipa', 'SiderPerú', 'Maestro', 'Sodimac', 'Promart', 'Ferreyros',
  'Tramontina Pro', 'Indeco', 'Graña y Montero Equipos', 'Electroandes SAC',
  'Coestal', 'Unicon', 'CEMEX', 'Quimpac', 'Pavimentadora Andina',
].sort((a,b)=>a.localeCompare(b,'es'));

// ---------- Utilidades ----------
const fmtDatePE = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('es-PE', { hour12: false }) : '—';

const normalizeInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const fmtMoney = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(value);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const startOfToday = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
const startOfWeek = () => { const d=startOfToday(); const wd=d.getDay()||7; d.setDate(d.getDate()-(wd-1)); return d; }; // lunes
const startOfMonth = () => { const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; };

export default function MovesPage() {
  // catálogos
  const [obras, setObras] = useState<Obra[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [frentes, setFrentes] = useState<Frente[]>([]);

  // form
  const [type, setType] = useState<MoveType>('IN');

  // defaults
  const [obraId, setObraId] = useState<number | ''>('');
  const [frenteId, setFrenteId] = useState<number | ''>('');
  const [materialText, setMaterialText] = useState<string>(''); // escribe o elige
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [unit, setUnit] = useState<string>('unidad'); // unidad elegible o nueva
  const [proveedorText, setProveedorText] = useState<string>(''); // IN solamente
  const [proveedorId, setProveedorId] = useState<number | null>(null);

  const [quantity, setQuantity] = useState<number | ''>('');
  const [unitCost, setUnitCost] = useState<number | ''>(''); // solo IN
  const [note, setNote] = useState<string>('');

  // estado UI
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [last, setLast] = useState<Move[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  // filtros
  const [filterType, setFilterType] = useState<'ALL'|'IN'|'OUT'>('ALL');
  const [filterRange, setFilterRange] = useState<'DAY'|'WEEK'|'MONTH'>('DAY');

  // disponible del material en obra
  const [disponible, setDisponible] = useState<number | null>(null);

  // ======== MODO EDICIÓN ========
  const [editMode, setEditMode] = useState(false);               // ON/OFF
  const [editingId, setEditingId] = useState<number|null>(null); // fila activa
  const [draft, setDraft] = useState<DraftState>(() => createEmptyDraft());                    // valores de edición

  // cargar catálogos + set defaults
  useEffect(() => {
    (async () => {
      try {
        const [o, m, p, f] = await Promise.all([
          api.get<Obra[]>('/obras'),
          api.get<Material[]>('/materials'),
          api.get<Proveedor[]>('/proveedores'),
          api.get<Frente[]>('/frentes'),
        ]);

        // fusionar presets
        const mm = [...m];
        PRESET_MATS.forEach(name => {
          if (!mm.find(x => x.name.toLowerCase() === name.toLowerCase()))
            mm.push({ id: -Math.random(), name, code: null, unit: null });
        });
        const pp = [...p];
        PRESET_PROV.forEach(name => {
          if (!pp.find(x => x.name.toLowerCase() === name.toLowerCase()))
            pp.push({ id: -Math.random(), name });
        });

        const ff = [...f];
        if (o.length) {
          const obraDefault = o.find(x => x.name.toLowerCase().includes('electrificación huaraz')) ?? o[0];
          setObraId(obraDefault.id);

          PRESET_FRENTES.forEach(name => {
            if (!ff.find(x => x.obraId === obraDefault.id && x.name.toLowerCase() === name.toLowerCase())) {
              ff.push({ id: -Math.random(), name, obraId: obraDefault.id });
            }
          });

          // Frente Centro por defecto
          const frenteCentro = ff.find(x => x.obraId === obraDefault.id && x.name.toLowerCase().includes('centro'));
          if (frenteCentro) setFrenteId(frenteCentro.id);
          else {
            const nuevo = { id: -Math.random(), name: 'Frente Centro', obraId: obraDefault.id };
            ff.push(nuevo);
            setFrenteId(nuevo.id);
          }
        }

        setObras(o);
        setMateriales(mm);
        setProveedores(pp);
        setFrentes(ff);

      } catch (error: unknown) {
        setMsg(`Error cargando catálogos: ${getErrorMessage(error)}`);
      }
    })();
  }, []);

  // cargar últimos movimientos
  const loadLast = async () => {
    try {
      const res = await api.get<MovesListResponse>('/moves?limit=200');
      const items: Move[] = Array.isArray(res) ? res : (res?.items ?? []);
      setLast(items);
    } catch (error: unknown) {
      setMsg(`Error cargando movimientos: ${getErrorMessage(error)}`);
    }
  };
  useEffect(() => { loadLast(); }, []);

  // opciones memorizadas
  const obraOpts: Opt[] = useMemo(() => obras.map(o => ({ value: o.id, label: o.name })), [obras]);
  const frenteOpts: Opt[] = useMemo(
    () => frentes.filter(f => (obraId ? f.obraId === obraId : true)).map(f => ({ value: f.id, label: f.name })),
    [frentes, obraId]
  );

  // Mapas
  const obraById = useMemo(() => {
    const m = new Map<number, string>();
    obras.forEach(o => m.set(o.id, o.name));
    return m;
  }, [obras]);

  const frenteById = useMemo(() => {
    const m = new Map<number, string>();
    frentes.forEach(f => m.set(f.id, f.name));
    return m;
  }, [frentes]);

  const matById = useMemo(() => {
    const map = new Map<number, Material>();
    materiales.forEach(m => { if (m.id > 0) map.set(m.id, m); });
    return map;
  }, [materiales]);

  // Filtrado local
  const filtered = useMemo(() => {
    const from =
      filterRange === 'DAY' ? startOfToday()
      : filterRange === 'WEEK' ? startOfWeek()
      : startOfMonth();

    return last
      .filter(m => (!obraId || m.obraId === obraId))
      .filter(m => (filterType === 'ALL' ? true : m.type === filterType))
      .filter(m => {
        if (!m.date) return true;
        return new Date(m.date) >= from;
      });
  }, [last, obraId, filterType, filterRange]);

  const displayRows = useMemo(() => {
    if (!selectedMaterialId) return filtered;
    return filtered.filter(row => row.materialId === selectedMaterialId);
  }, [filtered, selectedMaterialId]);

  const totalsByMaterial = useMemo(() => {
    const acc = new Map<number, { inU: number; outU: number; saldo: number }>();
    displayRows.forEach(r => {
      const t = acc.get(r.materialId) ?? { inU: 0, outU: 0, saldo: 0 };
      if (r.type === 'IN') t.inU += r.quantity; else t.outU += r.quantity;
      t.saldo = t.inU - t.outU;
      acc.set(r.materialId, t);
    });
    return acc;
  }, [displayRows]);

  const unitSummary = useMemo(() => {
    return displayRows.reduce(
      (acc, move) => {
        if (move.type === 'IN') acc.entries += move.quantity;
        else acc.exits += move.quantity;
        acc.balance = acc.entries - acc.exits;
        return acc;
      },
      { entries: 0, exits: 0, balance: 0 }
    );
  }, [displayRows]);

  const totalCost = useMemo(() => {
    const scoped = last.filter(m => (typeof obraId === 'number' ? m.obraId === obraId : true));
    return scoped.reduce((acc, move) => {
      if (move.type !== 'IN' || !move.unitCost) return acc;
      return acc + move.unitCost * move.quantity;
    }, 0);
  }, [last, obraId]);

  useEffect(() => {
    if (selectedMaterialId && !filtered.some(m => m.materialId === selectedMaterialId)) {
      setSelectedMaterialId(null);
    }
  }, [filtered, selectedMaterialId]);

  // disponibilidad para el form de alta
  useEffect(() => {
    const run = async () => {
      setDisponible(null);
      if (!obraId || (!materialId && !materialText)) return;
      try {
        const rows = await api.get<StockRow[]>(`/stock?obraId=${obraId}`);
        let matId = materialId;
        if (!matId && materialText) {
          const found = materiales.find(m => m.name.toLowerCase() === materialText.toLowerCase());
          if (found?.id && found.id > 0) matId = found.id;
        }
        if (!matId) { setDisponible(0); return; }
        const row = rows.find(r => r.materialId === matId);
        setDisponible(row?.stock ?? 0);
      } catch { /* ignore */ }
    };
    run();
  }, [obraId, materialId, materialText, materiales]);

  useEffect(() => {
    setSelectedMaterialId(null);
  }, [obraId, filterType, filterRange]);

  // helpers: crear/buscar material/proveedor (para el formulario de alta)
  const ensureMaterial = async (): Promise<number> => {
    if (materialId && materialId > 0) return materialId;
    const existing = materiales.find(m => m.name.toLowerCase() === materialText.trim().toLowerCase() && m.id > 0);
    if (existing) return existing.id;
    const created = await api.post<Material>('/materials', { name: materialText.trim(), unit });
    setMateriales(prev => [created, ...prev]);
    return created.id;
  };

  const ensureProveedor = async (): Promise<number | null> => {
    if (type === 'OUT') return null;
    if (proveedorId && proveedorId > 0) return proveedorId;
    const txt = proveedorText.trim();
    if (!txt) return null;
    const existing = proveedores.find(p => p.name.toLowerCase() === txt.toLowerCase() && p.id > 0);
    if (existing) return existing.id;
    const created = await api.post<Proveedor>('/proveedores', { name: txt });
    setProveedores(prev => [created, ...prev]);
    return created.id;
  };

  // submit (alta)
  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setMsg('');
    if (!obraId || !materialText || !quantity) {
      setMsg('Completa los campos obligatorios.');
      return;
    }
    if (type === 'IN' && !unitCost) {
      setMsg('Costo unitario es obligatorio para Entrada.');
      return;
    }
    if (type === 'OUT' && disponible !== null && Number(quantity) > disponible) {
      setMsg(`No puedes retirar ${quantity}; disponible: ${disponible}.`);
      return;
    }

    setLoading(true);
    try {
      const matId = await ensureMaterial();
      const provId = await ensureProveedor();

      const payload: MoveCreate = {
        obraId: Number(obraId),
        materialId: matId,
        type,
        quantity: Number(quantity),
        note: note || undefined,
      };
      if (frenteId && Number(frenteId) > 0) payload.frenteId = Number(frenteId);
      if (provId) payload.proveedorId = provId;
      if (type === 'IN' && unitCost) payload.unitCost = Number(unitCost);

      const created = await api.post<MoveCreated>('/moves', payload);
      setMsg(`Movimiento ${type} creado. Stock luego: ${created.balanceAfter ?? '—'}`);

      setMaterialText(''); setMaterialId(null);
      setQuantity(''); setUnitCost('');
      setProveedorText(''); setProveedorId(null);
      setNote(''); setDisponible(null);

      await loadLast();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // ======== EDICIÓN INLINE ========
  const beginRowEdit = (m: Move) => {
    const mat = matById.get(m.materialId);
    const prov = m.proveedorId ? proveedores.find(p => p.id === m.proveedorId) : null;
    setEditingId(m.id);
    setDraft({
      materialName: mat?.name ?? '',
      quantity: String(m.quantity),
      unit: mat?.unit ?? '',
      unitCost: m.type === 'IN' && typeof m.unitCost === 'number' ? String(m.unitCost) : '',
      note: m.note ?? '',
      proveedorName: prov?.name ?? '', // SOLO IN
    });
  };

  const resolveProveedorIdFromName = async (name: string): Promise<number|null> => {
    const clean = (name||'').trim();
    if (!clean) return null;
    const existing = proveedores.find(p => p.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing.id;
    const created = await api.post<Proveedor>('/proveedores', { name: clean });
    setProveedores(prev => [created, ...prev]);
    return created.id;
  };

  const saveRowEdit = async () => {
    if (!editingId) { setEditMode(false); return; }
    const m = last.find(x => x.id === editingId);
    if (!m) { setEditMode(false); setEditingId(null); setDraft(createEmptyDraft()); return; }

    // materialId por nombre
    let newMaterialId = m.materialId;
    if (draft.materialName) {
      const found = materiales.find(
        x => x.name.toLowerCase() === String(draft.materialName).toLowerCase()
      );
      if (found) newMaterialId = found.id;
    }

    // proveedorId por nombre (solo IN)
    let proveedorIdPayload: number|null = null;
    if (m.type === 'IN') {
      proveedorIdPayload = await resolveProveedorIdFromName(draft.proveedorName || '');
    }

    // 1) actualizar movimiento
    await api.put(`/moves/${m.id}`, {
      materialId: newMaterialId,
      quantity: Number(draft.quantity),
      unitCost: m.type === 'IN'
        ? (draft.unitCost === '' ? null : Number(draft.unitCost))
        : null,
      note: draft.note || null,
      proveedorId: m.type === 'IN' ? (proveedorIdPayload ?? null) : null,
    });

    // 2) si cambió la unidad del material, actualizar material
    const mat = matById.get(newMaterialId);
    if (mat && (draft.unit ?? '') !== (mat.unit ?? '')) {
      await api.put(`/materials/${newMaterialId}`, { unit: draft.unit || null });
    }

    await loadLast();
    setEditingId(null);
    setDraft(createEmptyDraft());
    setEditMode(false);
    setMsg('Movimiento actualizado ✅');
  };

  const toggleEditMode = () => {
    if (editMode) {
      // al salir, guardamos si hay fila seleccionada
      saveRowEdit();
    } else {
      setEditMode(true);
      setEditingId(null);
      setDraft(createEmptyDraft());
      setSelectedMaterialId(null);
      setMsg('Edición activada: haz click en una fila para editar');
    }
  };

  const handleRowClick = (m: Move) => {
    if (editMode) {
      if (editingId === m.id) return;
      beginRowEdit(m);
      return;
    }
    setSelectedMaterialId(prev => (prev === m.materialId ? null : m.materialId));
  };

  // exportar CSV (12 columnas)
  const exportCSV = () => {
    const header = [
      '#','Fecha','Tipo','Obra/Frente','Material','Cant.','U.Medida','Costo unit.','Costo total','Ingresado total','Saldo','Nota'
    ];
    const rows = displayRows.map(m => {
      const mat = matById.get(m.materialId);
      const matName = mat?.name ?? `Mat ${m.materialId}`;
      const um = mat?.unit ?? '—';
      const obraName = obraById.get(m.obraId) ?? `Obra ${m.obraId}`;
      const frenteName = m.frenteId ? (frenteById.get(m.frenteId) ?? `Frente ${m.frenteId}`) : '';
      const lugar = frenteName ? `${obraName} · ${frenteName}` : obraName;
      const unitStr = m.unitCost ? `S/ ${m.unitCost}` : '—';
      const totalStr = m.unitCost ? `S/ ${(m.unitCost * m.quantity).toFixed(2)}` : '—';
      const totals = totalsByMaterial.get(m.materialId);
      const ingresadoTotal = totals?.inU ?? 0;
      const saldoTotal = totals?.saldo ?? 0;

      return [
        m.id,
        fmtDatePE(m.date),
        m.type,
        lugar,
        matName,
        m.quantity,
        um,
        unitStr,
        totalStr,
        ingresadoTotal,
        saldoTotal,
        m.note ?? '',
      ];
    });

    const csv = [header, ...rows]
      .map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'movimientos.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-wrap">
      <h1 className="title">Movimientos</h1>
      <p className="subtitle">Registra entradas y salidas, con fecha/hora automática.</p>

      {/* KPIs cortos */}
      <div className="kpis">
        <div><span>ENTRADAS (U)</span><strong>{unitSummary.entries}</strong></div>
        <div><span>SALIDAS (U)</span><strong>{unitSummary.exits}</strong></div>
        <div><span>SALDO (U)</span><strong>{unitSummary.balance}</strong></div>
      </div>

      <form onSubmit={onSubmit} className="card grid-2">
        <div className="col">
          <label>Tipo *</label>
          <select
            value={type}
            onChange={e => {
              const t = e.target.value as MoveType;
              setType(t);
              if (t === 'OUT') { setUnitCost(''); setProveedorId(null); setProveedorText(''); }
            }}
          >
            <option value="IN">IN (Entrada)</option>
            <option value="OUT">OUT (Salida)</option>
          </select>
        </div>

        <div className="col">
          <label>Obra *</label>
          <select
            value={obraId}
            onChange={e => { setObraId(Number(e.target.value)); setFrenteId(''); }}
          >
            {obraOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="col">
          <label>Frente (opcional)</label>
          <select
            value={frenteId}
            onChange={e => setFrenteId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">—</option>
            {frenteOpts.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        <div className="col">
          <label>Material * {disponible !== null && <small className="badge">Stock disp.: {disponible}</small>}</label>
          <input
            list="materials"
            placeholder="Escribe o elige de la lista"
            value={materialText}
            onChange={e => {
              const value = normalizeInput(e.target.value);
              setMaterialText(value);
              setMaterialId(null);
            }}
          />
          <datalist id="materials">
            {materiales
              .slice()
              .sort((a,b)=>a.name.localeCompare(b.name,'es'))
              .map(m => <option key={`${m.id}-${m.name}`} value={m.name} />)}
          </datalist>
        </div>

        <div className="col">
          <label>Unidad</label>
          <input
            list="units"
            value={unit}
            onChange={e => setUnit(e.target.value ? normalizeInput(e.target.value) : '')}
            placeholder="Ej. kg, m, m³, unidad…"
          />
          <datalist id="units">
            {UNIT_OPTIONS.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>

        <div className="col">
          <label>Proveedor (solo IN)</label>
          <input
            list="providers"
            value={proveedorText}
            onChange={e => {
              const value = normalizeInput(e.target.value);
              setProveedorText(value);
              setProveedorId(null);
            }}
            placeholder="Razón social (opcional)"
            disabled={type === 'OUT'}
          />
          <datalist id="providers">
            {proveedores
              .slice()
              .sort((a,b)=>a.name.localeCompare(b.name,'es'))
              .map(p => <option key={`${p.id}-${p.name}`} value={p.name} />)}
          </datalist>
        </div>

        <div className="col">
          <label>Cantidad *</label>
          <input
            type="number" step="any" min="0.000001"
            value={quantity}
            onChange={e => setQuantity(e.target.value ? Number(e.target.value) : '')}
          />
        </div>

        <div className="col">
          <label>Costo unitario (solo IN)</label>
          <input
            type="number" step="any" min="0.000001"
            value={unitCost}
            onChange={e => setUnitCost(e.target.value ? Number(e.target.value) : '')}
            disabled={type === 'OUT'}
          />
        </div>

        <div className="col">
          <label>Fecha</label>
          <div className="readonly">{fmtDatePE(new Date().toISOString())} (auto)</div>
        </div>

        <div className="col-2">
          <label>Nota (opcional) — quién retira / motivo</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value ? normalizeInput(e.target.value) : '')}
            placeholder="Ej: Retira Juan Pérez / compra inicial / salida a frente / etc."
          />
        </div>

        <div className="col-2 actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Guardando…' : `Guardar movimiento`}
          </button>
          <button type="button" onClick={()=>{
            setMaterialText(''); setMaterialId(null);
            setQuantity(''); setUnitCost(''); setProveedorText(''); setProveedorId(null); setNote(''); setDisponible(null);
          }}>Limpiar</button>
          {msg && <span className="msg">{msg}</span>}
        </div>
      </form>

      {/* Filtros y export */}
      <div className="filters card">
        <div className="filters-group">
          <label>Ver:</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as 'ALL' | 'IN' | 'OUT')}
          >
            <option value="ALL">Todos</option>
            <option value="IN">Entradas</option>
            <option value="OUT">Salidas</option>
          </select>
        </div>
        <div className="filters-group">
          <label>Rango:</label>
          <select
            value={filterRange}
            onChange={e => setFilterRange(e.target.value as 'DAY' | 'WEEK' | 'MONTH')}
          >
            <option value="DAY">Hoy</option>
            <option value="WEEK">Semana</option>
            <option value="MONTH">Mes</option>
          </select>
        </div>
        <div className="filters-total">
          <span>COSTO TOTAL (S/)</span>
          <strong>{fmtMoney(totalCost)}</strong>
        </div>
        <div className="spacer" />

        {/* Botón global Editar/Guardar edición */}
        <button type="button" onClick={toggleEditMode}>
          {editMode ? 'Guardar edición' : 'Editar'}
        </button>

        <button onClick={exportCSV}>Exportar CSV</button>
        <button onClick={()=>window.print()}>Imprimir</button>
      </div>

      <h2 className="subtitle">Últimos movimientos</h2>
      <div className="table card">
        <div className="thead">
          <div>#</div>
          <div>Fecha</div>
          <div>Tipo</div>
          <div>Obra/Frente</div>
          <div>Material</div>
          <div className="num">Cant.</div>
          <div className="num">U.Medida</div>
          <div className="num">Costo unit.</div>
          <div className="num">Costo total</div>
          <div className="num">Ingresado total</div>
          <div className="num">Saldo</div>
          <div>Nota</div>
        </div>

        {displayRows.map(m => {
          const isEditing = editMode && editingId === m.id;
          const isSelected = !editMode && selectedMaterialId === m.materialId;

          const mat = matById.get(m.materialId);
          const matName = mat?.name ?? `Mat ${m.materialId}`;
          const um = mat?.unit ?? '—';
          const costoUnit = m.unitCost ? `S/ ${m.unitCost}` : '—';
          const costoTotal = m.unitCost ? `S/ ${(m.unitCost * m.quantity).toFixed(2)}` : '—';

          const totals = totalsByMaterial.get(m.materialId);
          const ingresadoTotal = totals?.inU ?? 0;
          const saldoTotal = totals?.saldo ?? 0;

          const obraName = obraById.get(m.obraId) ?? `Obra ${m.obraId}`;
          const frenteName = m.frenteId ? (frenteById.get(m.frenteId) ?? `Frente ${m.frenteId}`) : '';
          const lugar = frenteName ? `${obraName} · ${frenteName}` : obraName;

          return (
            <div
              key={m.id}
              className={`trow ${isEditing ? 'is-editing' : ''} ${isSelected ? 'is-selected' : ''}`}
              onClick={() => handleRowClick(m)}
              role={editMode ? 'button' : undefined}
              tabIndex={editMode ? 0 : undefined}
            >
              <div>{m.id}</div>
              <div>{fmtDatePE(m.date)}</div>
              <div className={m.type==='IN'?'in':'out'}>{m.type}</div>
              <div>{lugar}</div>

              {/* Material */}
              <div className="wrap">
                {isEditing ? (
                  <input
                    list="materials"
                    value={draft.materialName}
                    onChange={e => {
                      const value = normalizeInput(e.target.value);
                      setDraft(prev => ({ ...prev, materialName: value }));
                    }}
                    style={{width:'100%'}}
                  />
                ) : matName}
              </div>

              {/* Cantidad */}
              <div className="num">
                {isEditing ? (
                  <input
                    type="number" step="any"
                    value={draft.quantity}
                    onChange={e => setDraft(prev => ({ ...prev, quantity: e.target.value }))}
                    style={{width:90}}
                  />
                ) : m.quantity}
              </div>

              {/* U.Medida */}
              <div className="num">
                {isEditing ? (
                  <input
                    value={draft.unit}
                    onChange={e => {
                      const value = e.target.value ? normalizeInput(e.target.value) : '';
                      setDraft(prev => ({ ...prev, unit: value }));
                    }}
                    style={{width:90}}
                  />
                ) : um}
              </div>

              {/* Costo unit. */}
              <div className="num">
                {isEditing ? (
                  m.type==='IN'
                    ? <input
                        type="number" step="any"
                        value={draft.unitCost}
                        onChange={e => setDraft(prev => ({ ...prev, unitCost: e.target.value }))}
                        style={{width:110}}
                      />
                    : '—'
                ) : costoUnit}
              </div>

              {/* Costo total */}
              <div className="num">
                {isEditing
                  ? (m.type==='IN' && draft.unitCost && draft.quantity
                      ? `S/ ${(Number(draft.unitCost)*Number(draft.quantity)).toFixed(2)}`
                      : '—')
                  : costoTotal}
              </div>

              {/* Ingresado total */}
              <div className="num">{ingresadoTotal}</div>

              {/* Saldo */}
              <div className="num">{saldoTotal}</div>

              {/* Nota */}
              <div className="wrap">
                {isEditing ? (
                  <input
                    value={draft.note}
                    onChange={e => {
                      const value = e.target.value ? normalizeInput(e.target.value) : '';
                      setDraft(prev => ({ ...prev, note: value }));
                    }}
                  />
                ) : (m.note ?? '')}
              </div>
            </div>
          );
        })}

        {displayRows.length===0 && <div className="empty">Sin movimientos en el rango elegido.</div>}
      </div>

      {/* Datalists (materiales/proveedores) */}
      <datalist id="providers">
        {proveedores
          .slice()
          .sort((a,b)=>a.name.localeCompare(b.name,'es'))
          .map(p => <option key={`${p.id}-${p.name}`} value={p.name} />)}
      </datalist>
    </div>
  );
}
