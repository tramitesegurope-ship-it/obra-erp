/*cspell:disable*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import api from '../lib/api';
import type {
  MoveType,
  Obra,
  Material,
  MaterialGroup,
  Proveedor,
  Frente,
  Move,
  MoveCreate,
  MoveCreated,
  DocType,
  AssetStatus,
} from '../lib/types';
import { SearchableSelect } from '../components/SearchableSelect';
import { useDeleteAuth } from '../hooks/useDeleteAuth';


type Opt = { value: number; label: string };
type MovesListResponse = Move[] | { items?: Move[] };
type StockRow = {
  materialId: number;
  name: string | null;
  code: string | null;
  unit: string | null;
  groupId: number | null;
  groupName: string | null;
  groupParentId: number | null;
  groupColor: string | null;
  minStock: number;
  reorderQuantity: number;
  allowNegative: boolean;
  in: number;
  out: number;
  disponible: number;
  status: 'OK' | 'LOW' | 'OUT' | 'NEGATIVE';
  recommendedOrder: number;
  isCompanyAsset: boolean;
  assetStatus: AssetStatus | null;
  assetResponsible: string | null;
  assetLastOutDate: string | null;
};

type InventoryViewRow = StockRow & { groupPath: string };
type DraftState = {
  materialName: string;
  quantity: string;
  unit: string;
  unitCost: string;
  note: string;
  proveedorName: string;
  responsible: string;
  docSerie: string;
  docNumero: string;
  docType: DocType;
  isTaxable: boolean;
};

const createEmptyDraft = (): DraftState => ({
  materialName: '',
  quantity: '',
  unit: '',
  unitCost: '',
  note: '',
  proveedorName: '',
  responsible: '',
  docSerie: '',
  docNumero: '',
  docType: 'FACTURA',
  isTaxable: true,
});

// ---------- Catálogos “base” para autocompletar ----------
const UNIT_OPTIONS = [
  'unidad','kg','g','ton','m','m²','m³','lt','galón','bolsa','saco','par','juego','paquete','rollo','barra','plancha','tubo','cajón',
].sort((a,b)=>a.localeCompare(b,'es'));

const asPositiveNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const sanitizeStatus = (value: unknown): StockRow['status'] => {
  if (value === 'LOW' || value === 'OUT' || value === 'NEGATIVE') return value;
  return 'OK';
};

const INVENTORY_STATUS_LABEL: Record<StockRow['status'], string> = {
  OK: 'En stock',
  LOW: 'Bajo stock',
  OUT: 'Sin stock',
  NEGATIVE: 'Saldo negativo',
};

const sanitizeAssetStatus = (value: unknown): AssetStatus | null => {
  if (value === 'IN_WAREHOUSE' || value === 'OUT_ON_FIELD') return value;
  return null;
};

const normalizeStockRow = (input: Partial<StockRow & { stock?: number }>): StockRow => {
  const materialIdRaw = (input?.materialId ?? 0) as number | string;
  const materialId = typeof materialIdRaw === 'number'
    ? materialIdRaw
    : Number.isFinite(Number(materialIdRaw))
      ? Number(materialIdRaw)
      : 0;

  const disponible = asPositiveNumber(input?.disponible ?? input?.stock ?? 0);
  const inQty = asPositiveNumber(input?.in ?? 0);
  const outQty = asPositiveNumber(input?.out ?? 0);
  const minStock = asPositiveNumber(input?.minStock ?? 0);
  const reorderQuantity = asPositiveNumber(input?.reorderQuantity ?? 0);
  const recommendedOrder = asPositiveNumber(input?.recommendedOrder ?? 0);

  return {
    materialId,
    name: input?.name ?? null,
    code: input?.code ?? null,
    unit: input?.unit ?? null,
    groupId:
      typeof input?.groupId === 'number'
        ? input.groupId
        : Number.isFinite(Number(input?.groupId))
          ? Number(input?.groupId)
          : null,
    groupName: input?.groupName ?? null,
    groupParentId:
      typeof input?.groupParentId === 'number'
        ? input.groupParentId
        : Number.isFinite(Number(input?.groupParentId))
          ? Number(input?.groupParentId)
          : null,
    groupColor: input?.groupColor ?? null,
    minStock,
    reorderQuantity,
    allowNegative: Boolean(input?.allowNegative),
    in: inQty,
    out: outQty,
    disponible,
    status: sanitizeStatus(input?.status),
    recommendedOrder,
    isCompanyAsset: Boolean(input?.isCompanyAsset),
    assetStatus: sanitizeAssetStatus(input?.assetStatus),
    assetResponsible:
      typeof input?.assetResponsible === 'string' && input.assetResponsible.trim()
        ? input.assetResponsible
        : null,
    assetLastOutDate:
      typeof input?.assetLastOutDate === 'string' && input.assetLastOutDate
        ? input.assetLastOutDate
        : null,
  };
};

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

const DEFAULT_ASSET_STATUS: AssetStatus = 'IN_WAREHOUSE';

const sanitizeMaterial = (material: Material): Material => ({
  ...material,
  isCompanyAsset: material.isCompanyAsset ?? false,
  assetStatus: material.assetStatus ?? DEFAULT_ASSET_STATUS,
  assetResponsible: material.assetResponsible ?? null,
  groupId: material.groupId ?? null,
  group: material.group ?? null,
  minStock: material.minStock ?? 0,
  reorderQuantity: material.reorderQuantity ?? 0,
  allowNegative: material.allowNegative ?? false,
});

const buildMaterialsList = (items: Material[]): Material[] => {
  const sanitized = items.map(sanitizeMaterial);
  const registry = new Set(
    sanitized.map(item => normalizeSearchValue(item.name)),
  );

  PRESET_MATS.forEach(name => {
    if (!registry.has(name.toLowerCase())) {
      sanitized.push({
        id: -Math.floor(Math.random() * 1000000),
        name,
        code: null,
        unit: null,
        groupId: null,
        group: null,
        minStock: 0,
        reorderQuantity: 0,
        allowNegative: false,
        isCompanyAsset: false,
        assetStatus: DEFAULT_ASSET_STATUS,
        assetResponsible: null,
      });
    }
  });

  return sanitized;
};

const IGV_RATE = 0.18;
const DOC_TYPE_OPTIONS: DocType[] = ['FACTURA', 'BOLETA', 'RECIBO', 'OTRO'];
const DOC_TYPE_SELECT_OPTIONS = DOC_TYPE_OPTIONS.map((doc) => ({ value: doc, label: doc }));

const PRESET_PROV = [
  'Aceros Arequipa', 'SiderPerú', 'Maestro', 'Sodimac', 'Promart', 'Ferreyros',
  'Tramontina Pro', 'Indeco', 'Graña y Montero Equipos', 'Electroandes SAC',
  'Coestal', 'Unicon', 'CEMEX', 'Quimpac', 'Pavimentadora Andina',
].sort((a,b)=>a.localeCompare(b,'es'));

const MOVE_TYPE_OPTIONS: Array<{ value: MoveType; label: string }> = [
  { value: 'IN', label: 'IN' },
  { value: 'OUT', label: 'OUT' },
];

// ---------- Utilidades ----------
const fmtDatePE = (iso?: string) => {
  if (!iso) return '—';
  const plain = iso.slice(0, 10); // YYYY-MM-DD
  const parts = plain.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  // fallback for formatos inesperados
  return new Date(iso).toLocaleDateString('es-PE');
};

const normalizeInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const normalizeSearchValue = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

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
  const [docType, setDocType] = useState<DocType>('FACTURA');
  const [docSerie, setDocSerie] = useState<string>('');
  const [docNumero, setDocNumero] = useState<string>('');
  const [docTaxable, setDocTaxable] = useState<boolean>(true);
  const [isCompanyAsset, setIsCompanyAsset] = useState<boolean>(true);
  const [assetStatus, setAssetStatus] = useState<AssetStatus | null>(DEFAULT_ASSET_STATUS);
  const [currentResponsible, setCurrentResponsible] = useState<string>('');
  const [responsible, setResponsible] = useState<string>('');

  // estado UI
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [last, setLast] = useState<Move[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'MOVES' | 'INVENTORY'>('MOVES');
  const [materialGroups, setMaterialGroups] = useState<MaterialGroup[]>([]);
  const [inventoryRows, setInventoryRows] = useState<StockRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryGroupFilter, setInventoryGroupFilter] = useState<number | 'ALL' | 'UNGROUPED'>('ALL');
  const [inventoryShowLowOnly, setInventoryShowLowOnly] = useState(false);
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState<'ALL' | 'ASSETS' | 'CONSUMPTION'>('ALL');
  const [inventoryQuery, setInventoryQuery] = useState('');
  const [inventoryAlert, setInventoryAlert] = useState<string | null>(null);
  const [selectedInventoryMaterialId, setSelectedInventoryMaterialId] = useState<number | null>(null);
  const [materialDetailSaving, setMaterialDetailSaving] = useState(false);
  const [materialDetailForm, setMaterialDetailForm] = useState<{
    materialId: number | null;
    name: string;
    unit: string;
    groupId: string;
    minStock: string;
    reorderQuantity: string;
    allowNegative: boolean;
  }>({
    materialId: null,
    name: '',
    unit: '',
    groupId: '',
    minStock: '',
    reorderQuantity: '',
    allowNegative: false,
  });
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupParentId, setNewGroupParentId] = useState<number | ''>('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupAlert, setGroupAlert] = useState<string | null>(null);
  const deleteUnlocked = useDeleteAuth();
  const ensureDeleteUnlocked = () => {
    if (!deleteUnlocked) {
      window.alert('Debes ir a Seguridad e ingresar tu contraseña para habilitar las eliminaciones.');
      return false;
    }
    return true;
  };

  const updateMaterialDetailField = useCallback(<K extends keyof typeof materialDetailForm>(key: K, value: (typeof materialDetailForm)[K]) => {
    setMaterialDetailForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // filtros
const [filterType, setFilterType] = useState<'ALL'|'IN'|'OUT'>('ALL');
const [filterRange, setFilterRange] = useState<'DAY'|'WEEK'|'MONTH'|'ALL'>('ALL');
  const [materialQuery, setMaterialQuery] = useState<string>('');
  const [movesSearchResults, setMovesSearchResults] = useState<Move[] | null>(null);
  const [movesSearching, setMovesSearching] = useState(false);
  const [movesSearchError, setMovesSearchError] = useState<string | null>(null);
  const [movesSearchReloadKey, setMovesSearchReloadKey] = useState(0);
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [warehouseSearchFocused, setWarehouseSearchFocused] = useState(false);

  // disponible del material en obra
  const [disponible, setDisponible] = useState<number | null>(null);

  const materialInputRef = useRef<HTMLInputElement>(null);

  // ======== MODO EDICIÓN ========
  const [editMode, setEditMode] = useState(false);               // ON/OFF
  const [editingId, setEditingId] = useState<number|null>(null); // fila activa
  const [draft, setDraft] = useState<DraftState>(() => createEmptyDraft());                    // valores de edición

  // cargar catálogos + set defaults
  useEffect(() => {
    (async () => {
      try {
        const [o, m, p, f, groupsRes] = await Promise.all([
          api.get<Obra[]>('/obras'),
          api.get<Material[]>('/materials'),
          api.get<Proveedor[]>('/proveedores'),
          api.get<Frente[]>('/frentes'),
          api.get<{ items: MaterialGroup[] }>('/material-groups').catch(() => ({ items: [] })),
        ]);

        // fusionar presets
        const mm = buildMaterialsList(m);
        const pp = [...p];
        PRESET_PROV.forEach(name => {
          if (!pp.find(x => x.name.toLowerCase() === name.toLowerCase()))
            pp.push({ id: -Math.random(), name });
        });

        const ff = [...f];
        if (o.length) {
          const obraDefault =
            o.find(x => x.name.toLowerCase().includes('proyecto la carbonera')) ?? o[0];
          setObraId(obraDefault.id);

          PRESET_FRENTES.forEach(name => {
            if (!ff.find(x => x.obraId === obraDefault.id && x.name.toLowerCase() === name.toLowerCase())) {
              ff.push({ id: -Math.random(), name, obraId: obraDefault.id });
            }
          });

          const obraFrentes = ff.filter(x => x.obraId === obraDefault.id && x.id > 0);
          const frenteCentro = obraFrentes.find(x =>
            x.name.toLowerCase().includes('centro'),
          );
          if (frenteCentro) setFrenteId(frenteCentro.id);
          else if (obraFrentes.length > 0) setFrenteId(obraFrentes[0].id);
          else setFrenteId('');
        }

        setObras(o);
        setMateriales(mm);
        setProveedores(pp);
        setFrentes(ff);
        setMaterialGroups(groupsRes.items ?? []);

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

  const refreshMaterials = useCallback(async () => {
    try {
      const mats = await api.get<Material[]>('/materials');
      setMateriales(buildMaterialsList(mats));
    } catch (error: unknown) {
      setMsg(`Error actualizando materiales: ${getErrorMessage(error)}`);
    }
  }, []);

  const refreshMaterialGroups = useCallback(async () => {
    try {
      const res = await api.get<{ items: MaterialGroup[] }>('/material-groups');
      setMaterialGroups(res.items ?? []);
    } catch (error: unknown) {
      setMsg(`Error actualizando grupos de materiales: ${getErrorMessage(error)}`);
    }
  }, []);

  const loadInventorySnapshot = useCallback(async () => {
    if (typeof obraId !== 'number') {
      setInventoryRows([]);
      return;
    }
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const rows = await api.get<Array<Partial<StockRow & { stock?: number }>>>(`/stock?obraId=${obraId}`);
      const normalized = Array.isArray(rows) ? rows.map(normalizeStockRow) : [];
      setInventoryRows(normalized);
    } catch (error: unknown) {
      setInventoryError(getErrorMessage(error));
      setInventoryRows([]);
    } finally {
      setInventoryLoading(false);
    }
  }, [obraId]);

  // opciones memorizadas
  const obraOpts: Opt[] = useMemo(() => obras.map(o => ({ value: o.id, label: o.name })), [obras]);
  const frenteOpts: Opt[] = useMemo(
    () =>
      frentes
        .filter(f => f.id > 0 && (obraId ? f.obraId === obraId : true))
        .map(f => ({ value: f.id, label: f.name })),
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

  const proveedorById = useMemo(() => {
    const map = new Map<number, string>();
    proveedores.forEach(p => map.set(p.id, p.name));
    return map;
  }, [proveedores]);

  const groupById = useMemo(() => {
    const map = new Map<number, MaterialGroup>();
    materialGroups.forEach(group => map.set(group.id, group));
    return map;
  }, [materialGroups]);

  const belongsToGroup = useCallback(
    (rowGroupId: number | null, targetGroupId: number): boolean => {
      if (rowGroupId === null) return false;
      if (rowGroupId === targetGroupId) return true;
      let current: number | null | undefined = rowGroupId;
      const visited = new Set<number>();
      while (current != null && !visited.has(current)) {
        visited.add(current);
        if (current === targetGroupId) return true;
        current = groupById.get(current)?.parentId ?? null;
      }
      return false;
    },
    [groupById],
  );

  const buildGroupPath = useCallback(
    (groupId: number | null): string => {
      if (!groupId) return 'Sin grupo';
      const names: string[] = [];
      let current: number | null | undefined = groupId;
      const visited = new Set<number>();
      while (current != null && !visited.has(current)) {
        visited.add(current);
        const group = groupById.get(current);
        if (!group) break;
        names.push(group.name);
        current = group.parentId ?? null;
      }
      return names.length ? names.reverse().join(' › ') : 'Sin grupo';
    },
    [groupById],
  );

  const filterRangeStart = useMemo(() => {
    if (filterRange === 'DAY') return startOfToday();
    if (filterRange === 'WEEK') return startOfWeek();
    if (filterRange === 'MONTH') return startOfMonth();
    return null;
  }, [filterRange]);

  // Filtrado local
  const filtered = useMemo(() => {
    const from = filterRangeStart;
    const sourceRows = movesSearchResults ?? last;
    const normalizedQuery = normalizeSearchValue(materialQuery.trim());

    return sourceRows
      .filter(m => (!obraId || m.obraId === obraId))
      .filter(m => (filterType === 'ALL' ? true : m.type === filterType))
      .filter(m => {
        if (!m.date || from === null) return true;
        return new Date(m.date) >= from;
      })
      .filter(m => {
        if (!normalizedQuery) return true;
        const mat = matById.get(m.materialId);
        const values: string[] = [];
        const push = (value?: string | number | null) => {
          if (value === null || value === undefined) return;
          const text =
            typeof value === 'string'
              ? value
              : typeof value === 'number'
                ? String(value)
                : '';
          const trimmed = text.trim();
          if (trimmed) values.push(normalizeSearchValue(trimmed));
        };
        push(mat?.name);
        push(mat?.code);
        push(m.note);
        push(m.docSerie);
        push(m.docNumero);
        push(m.type);
        push(m.responsible);
        push(m.id);
        push(m.materialId);
        if (typeof m.proveedorId === 'number') {
          push(proveedorById.get(m.proveedorId) ?? `Proveedor ${m.proveedorId}`);
        }
        if (typeof m.obraId === 'number') {
          push(obraById.get(m.obraId) ?? `Obra ${m.obraId}`);
        }
        if (typeof m.frenteId === 'number') {
          push(frenteById.get(m.frenteId) ?? `Frente ${m.frenteId}`);
        }
        return values.some(value => value.includes(normalizedQuery));
      });
  }, [last, movesSearchResults, obraId, filterType, filterRangeStart, materialQuery, matById, proveedorById, obraById, frenteById]);

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

  const handlePrintMoves = useCallback(() => {
    if (displayRows.length === 0) {
      window.alert('No hay movimientos para imprimir con los filtros actuales.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow || !printWindow.document) {
      window.alert('No se pudo abrir la ventana de impresión. Revisa el bloqueador emergente.');
      return;
    }
    const { document: printDoc } = printWindow;

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const formatUnits = (value: number) =>
      new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

    const rangeLabel =
      filterRange === 'DAY'
        ? 'Hoy'
        : filterRange === 'WEEK'
          ? 'Últimos 7 días'
          : filterRange === 'MONTH'
            ? 'Últimos 30 días'
            : 'Todo el historial';
    const typeLabelMeta =
      filterType === 'IN'
        ? 'Solo entradas'
        : filterType === 'OUT'
          ? 'Solo salidas'
          : 'Entradas y salidas';

    const obraLabel =
      typeof obraId === 'number'
        ? obraById.get(obraId) ?? `Obra #${obraId}`
        : 'Todas las obras';
    const materialScope =
      selectedMaterialId !== null
        ? matById.get(selectedMaterialId)?.name ?? `Material #${selectedMaterialId}`
        : materialQuery.trim()
          ? `Coincidencias con “${materialQuery.trim()}”`
          : 'Todos los materiales';

    const generatedAt = new Date().toLocaleString('es-PE');
    const totalEntradasValor = displayRows.reduce((acc, move) => {
      if (move.type === 'IN' && typeof move.unitCost === 'number') {
        return acc + move.unitCost * move.quantity;
      }
      return acc;
    }, 0);
    const totalSalidasValor = displayRows.reduce((acc, move) => {
      if (move.type === 'OUT' && typeof move.unitCost === 'number') {
        return acc + move.unitCost * move.quantity;
      }
      return acc;
    }, 0);

    const summaryCards = [
      { label: 'Movimientos listados', value: String(displayRows.length) },
      { label: 'Entradas (U)', value: formatUnits(unitSummary.entries) },
      { label: 'Salidas (U)', value: formatUnits(unitSummary.exits) },
      { label: 'Saldo (U)', value: formatUnits(unitSummary.balance) },
      { label: 'Compras valorizadas', value: fmtMoney(totalEntradasValor) },
      { label: 'Salidas valorizadas', value: fmtMoney(totalSalidasValor) },
    ];

    const rowsHtml = displayRows
      .map((move, index) => {
        const material = matById.get(move.materialId);
        const obraName = obraById.get(move.obraId) ?? `Obra ${move.obraId}`;
        const frenteName =
          move.frenteId != null ? frenteById.get(move.frenteId) ?? `Frente ${move.frenteId}` : null;
        const obraFrente = frenteName ? `${obraName} / ${frenteName}` : obraName;
        const unitLabel = material?.unit ? material.unit : '—';
        const unitCostLabel = typeof move.unitCost === 'number' ? fmtMoney(move.unitCost) : '—';
        const totalCostLabel =
          typeof move.unitCost === 'number' ? fmtMoney(move.unitCost * move.quantity) : '—';
        const totals = totalsByMaterial.get(move.materialId);
        const ingresadoTotal = totals?.inU ?? 0;
        const saldoTotal = totals?.saldo ?? 0;
        const proveedorName =
          move.proveedorId != null ? proveedorById.get(move.proveedorId) ?? `Proveedor ${move.proveedorId}` : null;
        const serie = move.docSerie ? move.docSerie.trim().toUpperCase() : '';
        const numero = move.docNumero ? move.docNumero.trim() : '';
        const docParts = [move.docType ?? '', serie, numero].filter(Boolean).join(' ');
        const detailLines: string[] = [];
        if (proveedorName) detailLines.push(`Proveedor: ${escapeHtml(proveedorName)}`);
        if (docParts) detailLines.push(`Doc: ${escapeHtml(docParts)}`);
        if (move.note?.trim()) detailLines.push(`Nota: ${escapeHtml(move.note.trim())}`);
        const detailHtml = detailLines.length
          ? detailLines.map(line => `<div class="detail-line">${line}</div>`).join('')
          : '—';

        const materialName = material?.name ?? `Material #${move.materialId}`;
        const assetFlag = material?.isCompanyAsset ?? false;
        const status = move.assetStatus ?? (assetFlag ? material?.assetStatus ?? null : null);
        const trimmedResponsible = move.responsible?.trim();
        const fallbackResponsible =
          assetFlag && material?.assetResponsible ? material.assetResponsible.trim() : '';
        const responsibleName = trimmedResponsible
          ? trimmedResponsible
          : fallbackResponsible;
        const statusLabel =
          status === 'OUT_ON_FIELD'
            ? 'En operaciones'
            : status === 'IN_WAREHOUSE'
              ? 'En almacén'
              : '—';
        const statusClass =
          status === 'OUT_ON_FIELD'
            ? 'pill pill--danger'
            : status === 'IN_WAREHOUSE'
              ? 'pill pill--success'
              : 'pill pill--neutral';
        const typeClass = move.type === 'IN' ? 'pill pill--in' : 'pill pill--out';
        const typeLabelRow = move.type === 'IN' ? 'Entrada' : 'Salida';

        const dateLabel = move.date ? fmtDatePE(move.date) : '—';

        return `<tr>
          <td class="text-center">${index + 1}</td>
          <td>${escapeHtml(dateLabel)}</td>
          <td><span class="${typeClass}">${typeLabelRow}</span></td>
          <td>${escapeHtml(obraFrente)}</td>
          <td>${escapeHtml(materialName)}</td>
          <td class="numeric">${formatUnits(move.quantity)}</td>
          <td>${unitLabel !== '—' ? escapeHtml(unitLabel) : '—'}</td>
          <td class="numeric">${unitCostLabel}</td>
          <td class="numeric">${totalCostLabel}</td>
          <td class="numeric">${formatUnits(ingresadoTotal)}</td>
          <td class="numeric">${formatUnits(saldoTotal)}</td>
          <td>${responsibleName ? escapeHtml(responsibleName) : '—'}</td>
          <td><span class="${statusClass}">${statusLabel}</span></td>
          <td>${detailHtml}</td>
        </tr>`;
      })
      .join('');

    const summaryHtml = summaryCards
      .map(
        card => `<div class="card">
        <span>${card.label}</span>
        <strong>${escapeHtml(card.value)}</strong>
      </div>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Reporte de movimientos</title>
    <style>
      @media print {
        body { margin: 0; }
      }
      body {
        font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
        font-size: 11px;
        color: #0f172a;
        margin: 0;
        padding: 24px;
        background: #fff;
      }
      .wrap { max-width: 1180px; margin: 0 auto; }
      h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -0.02em; }
      p.meta { margin: 0; color: #475569; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }
      th { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; background: #f8fafc; }
      .numeric { text-align: right; font-variant-numeric: tabular-nums; }
      .text-center { text-align: center; }
      .summary-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
      .card { padding: 14px 16px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .card span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
      .card strong { display: block; font-size: 18px; margin-top: 4px; color: #0f172a; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
      .pill--in { background: #dcfce7; color: #15803d; }
      .pill--out { background: #fee2e2; color: #b91c1c; }
      .pill--success { background: #e0f2fe; color: #0369a1; }
      .pill--danger { background: #fee2e2; color: #b91c1c; }
      .pill--neutral { background: #e2e8f0; color: #475569; }
      .detail-line { font-size: 10px; color: #475569; margin-bottom: 2px; }
      .detail-line:last-child { margin-bottom: 0; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Reporte de movimientos</h1>
      <p class="meta"><strong>Obra:</strong> ${escapeHtml(obraLabel)} · <strong>Rango:</strong> ${escapeHtml(rangeLabel)} · <strong>Tipo:</strong> ${escapeHtml(typeLabelMeta)} · <strong>Filtro material:</strong> ${escapeHtml(materialScope)} · <strong>Generado:</strong> ${escapeHtml(generatedAt)}</p>
      <div class="summary-grid">
        ${summaryHtml}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th style="width:70px">Fecha</th>
            <th style="width:70px">Tipo</th>
            <th>Obra / Frente</th>
            <th>Material</th>
            <th style="width:70px">Cant. (U)</th>
            <th style="width:70px">Unidad</th>
            <th style="width:90px">C. unit</th>
            <th style="width:90px">C. total</th>
            <th style="width:90px">Ing. total</th>
            <th style="width:90px">Saldo</th>
            <th style="width:110px">Responsable</th>
            <th style="width:100px">Estado</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </body>
</html>`;

    printDoc.open('text/html', 'replace');
    printDoc.write(html);
    printDoc.close();

    let triggered = false;
    const triggerPrint = () => {
      if (triggered) return;
      triggered = true;
      printWindow.focus();
      printWindow.print();
    };

    if (printDoc.readyState === 'complete') {
      triggerPrint();
    } else {
      printDoc.addEventListener('DOMContentLoaded', triggerPrint, { once: true });
    }
    setTimeout(triggerPrint, 800);
  }, [
    displayRows,
    filterRange,
    filterType,
    obraById,
    obraId,
    matById,
    selectedMaterialId,
    materialQuery,
    unitSummary,
    frenteById,
    totalsByMaterial,
    proveedorById,
  ]);

  const inventoryFiltered = useMemo<InventoryViewRow[]>(() => {
    const query = normalizeSearchValue(inventoryQuery.trim());
    return inventoryRows
      .filter(row => {
        if (inventoryTypeFilter === 'ALL') return true;
        if (inventoryTypeFilter === 'ASSETS') return row.isCompanyAsset;
        if (inventoryTypeFilter === 'CONSUMPTION') return !row.isCompanyAsset;
        return true;
      })
      .filter(row => {
        if (inventoryGroupFilter === 'ALL') return true;
        if (inventoryGroupFilter === 'UNGROUPED') {
          return row.groupId === null;
        }
        return belongsToGroup(row.groupId, inventoryGroupFilter);
      })
      .filter(row => {
        if (!inventoryShowLowOnly) return true;
        return row.status === 'LOW' || row.status === 'OUT' || row.status === 'NEGATIVE';
      })
      .filter(row => {
        if (!query) return true;
        const haystack = normalizeSearchValue(
          [row.name ?? '', row.code ?? '', buildGroupPath(row.groupId)].join(' '),
        );
        return haystack.includes(query);
      })
      .map(row => {
        const status = row.status ?? 'OK';
        const disponible = asPositiveNumber(row.disponible);
        const minStock = asPositiveNumber(row.minStock);
        const reorderQty = asPositiveNumber(row.reorderQuantity);
        const suggested = asPositiveNumber(row.recommendedOrder);
        return {
          ...row,
          status,
          disponible,
          minStock,
          reorderQuantity: reorderQty,
          recommendedOrder: suggested,
          groupPath: buildGroupPath(row.groupId),
        };
      })
      .sort((a, b) => a.name?.localeCompare(b.name ?? '') ?? 0);
  }, [inventoryRows, inventoryGroupFilter, inventoryShowLowOnly, inventoryQuery, buildGroupPath, belongsToGroup, inventoryTypeFilter]);

  const inventoryStats = useMemo(() => {
    const total = inventoryFiltered.length;
    const low = inventoryFiltered.filter(row => row.status === 'LOW').length;
    const out = inventoryFiltered.filter(row => row.status === 'OUT').length;
    const negative = inventoryFiltered.filter(row => row.status === 'NEGATIVE').length;
    const assets = inventoryFiltered.filter(row => row.isCompanyAsset);
    const assetsInWarehouse = assets.filter(row => row.assetStatus !== 'OUT_ON_FIELD').length;
    const assetsOut = assets.filter(row => row.assetStatus === 'OUT_ON_FIELD').length;
    const consumptionStock = inventoryFiltered
      .filter(row => !row.isCompanyAsset)
      .reduce((acc, row) => acc + row.disponible, 0);
    return { total, low, out, negative, assetsInWarehouse, assetsOut, consumptionStock };
  }, [inventoryFiltered]);

  const warehouseSearchResults = useMemo(() => {
    const term = normalizeSearchValue(warehouseSearch.trim());
    if (!term) return [];
    const matches: Array<{
      materialId: number;
      name: string;
      code: string | null;
      disponible: number;
      unit: string | null;
      status: StockRow['status'];
    }> = [];
    const seen = new Set<number>();
    inventoryRows.forEach((row) => {
      if (seen.has(row.materialId)) return;
      const material = matById.get(row.materialId);
      const name = (material?.name ?? row.name ?? '').trim();
      const code = (material?.code ?? row.code ?? '').trim();
      const haystack = normalizeSearchValue(`${name} ${code}`);
      if (!haystack.trim()) return;
      if (!haystack.includes(term)) return;
      matches.push({
        materialId: row.materialId,
        name: name || `Material #${row.materialId}`,
        code: code || null,
        disponible: asPositiveNumber(row.disponible),
        unit: material?.unit ?? row.unit ?? null,
        status: row.status ?? 'OK',
      });
      seen.add(row.materialId);
    });
    matches.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    return matches.slice(0, 8);
  }, [warehouseSearch, inventoryRows, matById]);

  const handleWarehouseQuickPick = useCallback(
    (materialId: number, info?: { name?: string | null; unit?: string | null }) => {
      const resolvedName =
        info?.name?.trim() ||
        matById.get(materialId)?.name ||
        '';
      if (!resolvedName) return;
      setViewMode('MOVES');
      setSelectedMaterialId(materialId);
      setMaterialQuery('');
      setMaterialId(materialId);
      setMaterialText(resolvedName);
      const meta = matById.get(materialId);
      const resolvedUnit = meta?.unit ?? info?.unit ?? null;
      if (resolvedUnit) setUnit(resolvedUnit);
      setWarehouseSearch('');
      setWarehouseSearchFocused(false);
      window.setTimeout(() => {
        materialInputRef.current?.focus();
      }, 0);
    },
    [matById, materialInputRef],
  );

  const selectedInventoryRow = useMemo(() => {
    if (!selectedInventoryMaterialId) return null;
    const row = inventoryRows.find(item => item.materialId === selectedInventoryMaterialId);
    if (!row) return null;
    return {
      ...row,
      disponible: asPositiveNumber(row.disponible),
      minStock: asPositiveNumber(row.minStock),
      reorderQuantity: asPositiveNumber(row.reorderQuantity),
      recommendedOrder: asPositiveNumber(row.recommendedOrder),
    };
  }, [inventoryRows, selectedInventoryMaterialId]);

  const groupOptions = useMemo(() => {
    return materialGroups
      .slice()
      .sort((a, b) => buildGroupPath(a.id).localeCompare(buildGroupPath(b.id)))
      .map(group => {
        const path = buildGroupPath(group.id);
        const depth = Math.max(path.split(' › ').length - 1, 0);
        const indent = depth > 0 ? '— '.repeat(depth) : '';
        return { value: group.id, label: `${indent}${group.name}` };
      });
  }, [materialGroups, buildGroupPath]);

  const inventoryCountByGroup = useMemo(() => {
    const counts = new Map<number, number>();
    materialGroups.forEach(group => counts.set(group.id, 0));
    inventoryRows.forEach(row => {
      if (row.groupId == null) return;
      materialGroups.forEach(group => {
        if (belongsToGroup(row.groupId, group.id)) {
          counts.set(group.id, (counts.get(group.id) ?? 0) + 1);
        }
      });
    });
    return counts;
  }, [inventoryRows, materialGroups, belongsToGroup]);

  const ungroupedCount = useMemo(
    () => inventoryRows.filter(row => row.groupId == null).length,
    [inventoryRows],
  );

  useEffect(() => {
    if (selectedMaterialId && !filtered.some(m => m.materialId === selectedMaterialId)) {
      setSelectedMaterialId(null);
    }
  }, [filtered, selectedMaterialId]);

  // disponibilidad para el form de alta
  useEffect(() => {
    const run = async () => {
      setDisponible(null);
      if (!obraId || (!materialId && !materialText.trim())) return;
      try {
        const response = await api.get<Array<Partial<StockRow & { stock?: number }>>>(`/stock?obraId=${obraId}`);
        const rows = Array.isArray(response) ? response.map(normalizeStockRow) : [];
        let matId = materialId;
        if (!matId && materialText) {
          const lookup = materialText.trim().toLowerCase();
          const found = materiales.find(m => m.name.toLowerCase() === lookup);
          if (found?.id && found.id > 0) matId = found.id;
        }
        if (!matId) { setDisponible(0); return; }
        const row = rows.find(r => r.materialId === matId);
        setDisponible(row?.disponible ?? 0);
      } catch { /* ignore */ }
    };
    run();
  }, [obraId, materialId, materialText, materiales]);

  useEffect(() => {
    setSelectedMaterialId(null);
  }, [obraId, filterType, filterRange, materialQuery]);

  useEffect(() => {
    const trimmed = materialQuery.trim();
    if (trimmed.length < 2) {
      setMovesSearchResults(null);
      setMovesSearchError(null);
      setMovesSearching(false);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('limit', '1200');
    params.set('search', trimmed);
    if (typeof obraId === 'number') params.set('obraId', String(obraId));
    if (filterType !== 'ALL') params.set('type', filterType);
    if (filterRangeStart) params.set('from', filterRangeStart.toISOString());

    setMovesSearching(true);
    setMovesSearchError(null);
    (async () => {
      try {
        const res = await api.get<MovesListResponse>(`/moves?${params.toString()}`);
        if (cancelled) return;
        const items = Array.isArray(res) ? res : res.items ?? [];
        setMovesSearchResults(items);
      } catch (error) {
        if (cancelled) return;
        setMovesSearchError(getErrorMessage(error));
        setMovesSearchResults([]);
      } finally {
        if (!cancelled) setMovesSearching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [materialQuery, obraId, filterType, filterRangeStart, movesSearchReloadKey]);

  useEffect(() => {
    loadInventorySnapshot();
  }, [loadInventorySnapshot]);

  useEffect(() => {
    if (!selectedInventoryMaterialId) {
      setMaterialDetailForm({
        materialId: null,
        name: '',
        unit: '',
        groupId: '',
        minStock: '',
        reorderQuantity: '',
        allowNegative: false,
      });
      return;
    }
    const row = inventoryRows.find(item => item.materialId === selectedInventoryMaterialId);
    if (!row) {
      return;
    }
    const material = matById.get(row.materialId);
    setMaterialDetailForm({
      materialId: row.materialId,
      name: material?.name ?? row.name ?? '',
      unit: material?.unit ?? row.unit ?? '',
      groupId: material?.groupId != null ? String(material.groupId) : row.groupId != null ? String(row.groupId) : '',
      minStock: row.minStock ? String(asPositiveNumber(row.minStock)) : '',
      reorderQuantity: row.reorderQuantity ? String(asPositiveNumber(row.reorderQuantity)) : '',
      allowNegative: row.allowNegative ?? false,
    });
  }, [inventoryRows, matById, selectedInventoryMaterialId]);

  useEffect(() => {
    if (type === 'OUT') {
      setDocType('OTRO');
      setDocSerie('');
      setDocNumero('');
      setDocTaxable(false);
    } else {
      setDocType('FACTURA');
      setDocTaxable(true);
    }
  }, [type]);

useEffect(() => {
  if (docType !== 'FACTURA') {
    setDocTaxable(false);
  }
}, [docType]);

useEffect(() => {
  if (!materialText.trim()) {
    setMaterialId(null);
    setIsCompanyAsset(true);
    setAssetStatus(DEFAULT_ASSET_STATUS);
    setCurrentResponsible('');
    if (type !== 'OUT') setResponsible('');
    return;
  }
  const lookup = normalizeSearchValue(materialText.trim());
  const found = materiales.find(
    (m) => m.id > 0 && normalizeSearchValue(m.name) === lookup,
  );
  if (found) {
    setMaterialId(found.id);
    if (found.unit) setUnit(found.unit);
    const assetFlag = !!found.isCompanyAsset;
    setIsCompanyAsset(assetFlag);
    setAssetStatus(assetFlag ? found.assetStatus ?? DEFAULT_ASSET_STATUS : null);
    setCurrentResponsible(found.assetResponsible ?? '');
    if (!assetFlag) {
      setResponsible('');
    } else if (found.assetStatus === 'OUT_ON_FIELD') {
      setResponsible(type === 'IN' ? found.assetResponsible ?? '' : '');
    } else {
      setResponsible('');
    }
  } else {
    setMaterialId(null);
    setIsCompanyAsset(false);
    setAssetStatus(null);
    setCurrentResponsible('');
  }
}, [materialText, materiales, type]);

  // helpers: crear/buscar material/proveedor (para el formulario de alta)
  const ensureMaterial = async (): Promise<number> => {
    if (materialId && materialId > 0) {
      const current = materiales.find((m) => m.id === materialId);
      if (current && current.isCompanyAsset !== isCompanyAsset) {
        await api.patch(`/materials/${materialId}`, { isCompanyAsset });
        await refreshMaterials();
      }
      return materialId;
    }

    const cleanName = normalizeSearchValue(materialText.trim());
    const existing = materiales.find(
      (m) => m.id > 0 && normalizeSearchValue(m.name) === cleanName,
    );

    if (existing) {
      if (existing.isCompanyAsset !== isCompanyAsset) {
        await api.patch(`/materials/${existing.id}`, { isCompanyAsset });
        await refreshMaterials();
      }
      return existing.id;
    }

    const created = await api.post<Material>('/materials', {
      name: materialText.trim(),
      unit: unit || null,
      isCompanyAsset,
    });
    await refreshMaterials();
    return created.id;
  };

  const handleAssetToggle = async (checked: boolean) => {
    setIsCompanyAsset(checked);
    setAssetStatus(checked ? DEFAULT_ASSET_STATUS : null);
    if (!checked) {
      setCurrentResponsible('');
      setResponsible('');
    }

    if (materialText.trim() === '') return;
    if (materialId && materialId > 0) {
      try {
        await api.patch(`/materials/${materialId}`, {
          isCompanyAsset: checked,
          assetResponsible: checked ? undefined : null,
        });
        await refreshMaterials();
      } catch (error: unknown) {
        setMsg(getErrorMessage(error));
      }
    }
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
  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setMsg('');
    if (!obraId || !materialText.trim() || !quantity) {
      setMsg('Completa los campos obligatorios.');
      return;
    }
    if (type === 'OUT' && disponible !== null && Number(quantity) > disponible) {
      setMsg(`No puedes retirar ${quantity}; disponible: ${disponible}.`);
      return;
    }
    if (isCompanyAsset && type === 'OUT' && !responsible.trim()) {
      setMsg('Indica el responsable que retira el activo.');
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
      if (type === 'IN') {
        payload.docType = docType;
        if (docSerie.trim()) payload.docSerie = docSerie.trim().toUpperCase();
        if (docNumero.trim()) payload.docNumero = docNumero.trim();
        const taxable = docType === 'FACTURA' ? docTaxable : false;
        payload.isTaxable = taxable;
        if (taxable) payload.igvRate = IGV_RATE;
      }
      const trimmedResponsible = responsible.trim();
      if (trimmedResponsible) {
        payload.responsible = trimmedResponsible;
      } else if (isCompanyAsset && type === 'IN' && currentResponsible) {
        payload.responsible = currentResponsible;
      }

      const created = await api.post<MoveCreated>('/moves', payload);
      setMsg(`Movimiento ${type} creado. Stock luego: ${created.balanceAfter ?? '—'}`);

      setMaterialText(''); setMaterialId(null);
      setQuantity(''); setUnitCost('');
      setProveedorText(''); setProveedorId(null);
      setNote(''); setDisponible(null);
      setDocSerie('');
      setDocNumero('');
      if (type === 'IN') {
        setDocType('FACTURA');
        setDocTaxable(true);
      } else {
        setDocType('OTRO');
        setDocTaxable(false);
      }
      setIsCompanyAsset(true);
      setAssetStatus(DEFAULT_ASSET_STATUS);
      setCurrentResponsible('');
      setResponsible('');
      materialInputRef.current?.focus();

      await loadLast();
      await refreshMaterials();
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
    const docTypeValue: DocType =
      (m.docType && ['FACTURA', 'BOLETA', 'RECIBO', 'OTRO'].includes(m.docType)
        ? (m.docType as DocType)
        : 'FACTURA');
    setEditingId(m.id);
    setDraft({
      materialName: mat?.name ?? '',
      quantity: String(m.quantity),
      unit: mat?.unit ?? '',
      unitCost: m.type === 'IN' && typeof m.unitCost === 'number' ? String(m.unitCost) : '',
      note: m.note ?? '',
      proveedorName: prov?.name ?? '',
      responsible: m.responsible ?? '',
      docSerie: m.docSerie ?? '',
      docNumero: m.docNumero ?? '',
      docType: docTypeValue,
      isTaxable: m.type === 'IN' ? m.isTaxable !== false : false,
    });
  };

  const resolveProveedorIdFromName = async (name: string): Promise<number|null> => {
    const clean = (name||'').trim();
    if (!clean) return null;
    const target = normalizeSearchValue(clean);
    const existing = proveedores.find(
      (p) => normalizeSearchValue(p.name) === target,
    );
    if (existing) return existing.id;
    const created = await api.post<Proveedor>('/proveedores', { name: clean });
    setProveedores(prev => [created, ...prev]);
    return created.id;
  };

  const saveRowEdit = async () => {
    if (!editingId) {
      setEditMode(false);
      return;
    }
    if (!ensureDeleteUnlocked()) {
      setMsg('Debes ir a Seguridad y habilitar la edición/eliminación.');
      setEditMode(false);
      return;
    }
    const m = (movesSearchResults ?? last).find(x => x.id === editingId);
    if (!m) {
      setEditMode(false);
      setEditingId(null);
      setDraft(createEmptyDraft());
      return;
    }

    let newMaterialId = m.materialId;
    if (draft.materialName.trim()) {
      const target = normalizeSearchValue(draft.materialName);
      const found = materiales.find(
        x => x.id > 0 && normalizeSearchValue(x.name) === target,
      );
      if (found) newMaterialId = found.id;
    }

    const parsedQuantity = Number(draft.quantity || m.quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setMsg('Ingresa una cantidad válida para actualizar el movimiento.');
      return;
    }

    let proveedorIdPayload: number | null = null;
    if (m.type === 'IN') {
      proveedorIdPayload = await resolveProveedorIdFromName(draft.proveedorName || '');
    }

    const payload: Record<string, unknown> = {
      materialId: newMaterialId,
      quantity: parsedQuantity,
      note: draft.note || null,
      responsible: draft.responsible.trim() ? draft.responsible.trim() : null,
    };
    if (m.type === 'IN') {
      if (draft.unitCost && !Number.isFinite(Number(draft.unitCost))) {
        setMsg('Ingresa un costo unitario válido.');
        return;
      }
      payload.unitCost = draft.unitCost === '' ? null : Number(draft.unitCost);
      payload.proveedorId = proveedorIdPayload;
      payload.docSerie = draft.docSerie.trim() ? draft.docSerie.trim().toUpperCase() : null;
      payload.docNumero = draft.docNumero.trim() ? draft.docNumero.trim() : null;
      payload.docType = draft.docType;
      const taxable = draft.docType === 'FACTURA' ? draft.isTaxable : false;
      payload.isTaxable = taxable;
      if (taxable) payload.igvRate = IGV_RATE;
      else payload.igvRate = 0;
    }

    try {
      await api.put(`/moves/${m.id}`, payload);
      const mat = matById.get(newMaterialId);
      if (mat && (draft.unit ?? '') !== (mat.unit ?? '')) {
        await api.put(`/materials/${newMaterialId}`, { unit: draft.unit || null });
      }
      await loadLast();
      setMovesSearchReloadKey((prev) => prev + 1);
      setEditingId(null);
      setDraft(createEmptyDraft());
      setEditMode(false);
      setMsg('Movimiento actualizado ✅');
    } catch (error) {
      setMsg(getErrorMessage(error));
    }
  };

  const toggleEditMode = () => {
    if (editMode) {
      saveRowEdit();
      return;
    }
    if (!ensureDeleteUnlocked()) {
      setMsg('Debes ir a Seguridad y desbloquear la edición.');
      return;
    }
    setEditMode(true);
    setEditingId(null);
    setDraft(createEmptyDraft());
    setSelectedMaterialId(null);
    setMsg('Edición activada: haz click en una fila para editar');
  };

  const handleRowClick = (m: Move) => {
    if (editMode) {
      if (editingId === m.id) return;
      beginRowEdit(m);
      return;
    }
    setSelectedMaterialId(prev => (prev === m.materialId ? null : m.materialId));
  };

  const handleDeleteMove = async (move: Move, event?: MouseEvent<HTMLButtonElement>) => {
    if (!ensureDeleteUnlocked()) return;
    event?.stopPropagation();
    if (!window.confirm(`¿Eliminar el movimiento #${move.id}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await api.delete(`/moves/${move.id}`);
      if (editingId === move.id) {
        setEditingId(null);
        setDraft(createEmptyDraft());
        setEditMode(false);
      }
      if (selectedMaterialId === move.materialId) {
        setSelectedMaterialId(null);
      }
      setMsg('Movimiento eliminado.');
      await loadLast();
      await refreshMaterials();
    } catch (error: unknown) {
      setMsg(getErrorMessage(error));
    }
  };

  // exportar CSV (12 columnas)
  const exportCSV = () => {
    const header = [
      '#',
      'Fecha',
      'Tipo',
      'Obra/Frente',
      'Material',
      'Cant.',
      'U. med.',
      'C. unit',
      'C. total',
      'Ing. total',
      'Saldo',
      'Responsable',
      'Estado',
      'Nota',
    ];
    const rows = displayRows.map(m => {
      const mat = matById.get(m.materialId);
      const matName = mat?.name ?? `Mat ${m.materialId}`;
      const um = mat?.unit ?? '—';
      const obraName = obraById.get(m.obraId) ?? `Obra ${m.obraId}`;
      const frenteName = m.frenteId ? (frenteById.get(m.frenteId) ?? `Frente ${m.frenteId}`) : '';
      const lugar = frenteName ? `${obraName} · ${frenteName}` : obraName;
      const unitStr = typeof m.unitCost === 'number' ? fmtMoney(m.unitCost) : '—';
      const totalCostValue =
        typeof m.totalCost === 'number'
          ? m.totalCost
          : typeof m.unitCost === 'number'
            ? m.unitCost * m.quantity
            : null;
      const totalStr = typeof totalCostValue === 'number' ? fmtMoney(totalCostValue) : '—';
      const totals = totalsByMaterial.get(m.materialId);
      const ingresadoTotal = totals?.inU ?? 0;
      const saldoTotal = totals?.saldo ?? 0;
      const status = m.assetStatus ?? (mat?.isCompanyAsset ? mat?.assetStatus ?? null : null);
      const statusLabel =
        status === 'OUT_ON_FIELD'
          ? 'En operaciones'
          : status === 'IN_WAREHOUSE'
            ? 'En almacén'
            : '—';
      const moveResponsible = m.responsible ?? (mat?.isCompanyAsset ? mat?.assetResponsible ?? '' : '');
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
        moveResponsible,
        statusLabel,
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

  const handleSelectInventoryRow = (materialId: number) => {
    setSelectedInventoryMaterialId(prev => (prev === materialId ? null : materialId));
    setInventoryAlert(null);
  };

  const handleSaveMaterialDetail = async () => {
    if (!materialDetailForm.materialId) return;
    const nameValue = materialDetailForm.name.trim();
    if (nameValue.length < 2) {
      setInventoryAlert('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    const minStockValue = materialDetailForm.minStock.trim() === '' ? 0 : Number(materialDetailForm.minStock);
    const reorderValue =
      materialDetailForm.reorderQuantity.trim() === ''
        ? 0
        : Number(materialDetailForm.reorderQuantity);
    if (!Number.isFinite(minStockValue) || minStockValue < 0) {
      setInventoryAlert('Ingresa un stock mínimo válido (0 o mayor).');
      return;
    }
    if (!Number.isFinite(reorderValue) || reorderValue < 0) {
      setInventoryAlert('Ingresa una cantidad de reorden válida (0 o mayor).');
      return;
    }

    setMaterialDetailSaving(true);
    setInventoryAlert(null);
    try {
      await api.patch(`/materials/${materialDetailForm.materialId}`, {
        name: nameValue,
        unit: materialDetailForm.unit ? materialDetailForm.unit.trim() : null,
        groupId:
          materialDetailForm.groupId === ''
            ? null
            : Number(materialDetailForm.groupId),
        minStock: minStockValue,
        reorderQuantity: reorderValue,
        allowNegative: materialDetailForm.allowNegative,
      });
      setInventoryRows(prev =>
        prev.map(row =>
          row.materialId === materialDetailForm.materialId
            ? {
                ...row,
                name: nameValue,
                unit: materialDetailForm.unit || row.unit,
                groupId:
                  materialDetailForm.groupId === ''
                    ? null
                    : Number(materialDetailForm.groupId),
                minStock: minStockValue,
                reorderQuantity: reorderValue,
                allowNegative: materialDetailForm.allowNegative,
              }
            : row,
        ),
      );
      await Promise.all([refreshMaterials(), refreshMaterialGroups(), loadInventorySnapshot()]);
      setInventoryAlert('Material actualizado.');
    } catch (error: unknown) {
      setInventoryAlert(getErrorMessage(error));
    } finally {
      setMaterialDetailSaving(false);
    }
  };

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newGroupName.trim()) {
      setGroupAlert('Indica un nombre para el grupo.');
      return;
    }
    setCreatingGroup(true);
    setGroupAlert(null);
    try {
      await api.post('/material-groups', {
        name: newGroupName.trim(),
        parentId: newGroupParentId === '' ? null : Number(newGroupParentId),
      });
      setNewGroupName('');
      setNewGroupParentId('');
      setGroupAlert('Grupo creado.');
      await refreshMaterialGroups();
      await loadInventorySnapshot();
    } catch (error: unknown) {
      setGroupAlert(getErrorMessage(error));
    } finally {
      setCreatingGroup(false);
    }
  };

  const resolveInventoryDisplay = useCallback(
    (row: InventoryViewRow) => {
      const materialMeta = matById.get(row.materialId);
      const displayName =
        row.name && row.name.trim()
          ? row.name
          : materialMeta?.name && materialMeta.name.trim()
            ? materialMeta.name
            : `Material ${row.materialId}`;
      const displayCode =
        row.code && row.code.trim()
          ? row.code
          : materialMeta?.code && materialMeta.code.trim()
            ? materialMeta.code
            : '—';
      const displayUnit =
        row.unit && row.unit.trim()
          ? row.unit
          : materialMeta?.unit && materialMeta.unit.trim()
            ? materialMeta.unit
            : '—';
      const statusLabel =
        row.status === 'LOW'
          ? 'Bajo stock'
          : row.status === 'OUT'
            ? 'Sin stock'
            : row.status === 'NEGATIVE'
              ? 'Saldo negativo'
              : 'OK';
      const statusClass =
        row.status === 'OK'
          ? 'status-pill success'
          : row.status === 'LOW'
            ? 'status-pill warning'
            : 'status-pill danger';
      const isAsset = Boolean(row.isCompanyAsset);
      const assetOut = isAsset && row.assetStatus === 'OUT_ON_FIELD';
      const locationLabel = isAsset
        ? assetOut
          ? 'En obra'
          : 'En almacén'
        : 'Consumo';
      const responsibleLabel = isAsset
        ? assetOut
          ? row.assetResponsible?.trim() || 'Sin responsable'
          : 'En almacén'
        : '—';
      const daysOut =
        assetOut && row.assetLastOutDate
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(row.assetLastOutDate).getTime()) / 86_400_000,
              ),
            )
          : null;
      return {
        displayName,
        displayCode,
        displayUnit,
        statusLabel,
        statusClass,
        isAsset,
        locationLabel,
        responsibleLabel,
        daysOut,
      };
    },
    [matById],
  );

  const handlePrintInventory = useCallback(() => {
    if (inventoryFiltered.length === 0) {
      window.alert('No hay registros de inventario para imprimir.');
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const printDoc = iframe.contentDocument;
    if (!printDoc) {
      document.body.removeChild(iframe);
      window.alert('No se pudo preparar el reporte para imprimir.');
      return;
    }
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const obraNombre =
      typeof obraId === 'number' ? obraById.get(obraId) ?? `Obra #${obraId}` : 'Obra no seleccionada';
    const generatedAt = new Date().toLocaleString('es-PE');

    const rowsHtml = inventoryFiltered
      .map((row, index) => {
        const {
          displayName,
          displayCode,
          displayUnit,
          statusLabel,
          locationLabel,
          responsibleLabel,
          daysOut,
        } = resolveInventoryDisplay(row);
        const statusClass =
          row.status === 'OK'
            ? 'badge badge-ok'
            : row.status === 'LOW'
              ? 'badge badge-warn'
              : 'badge badge-danger';
        const groupLabel = row.groupPath?.trim()
          ? `Grupo: ${escapeHtml(row.groupPath)}`
          : 'Grupo: Sin grupo';
        const detailLines = [
          groupLabel,
          displayCode !== '—' ? `Código: ${escapeHtml(displayCode)}` : null,
          row.minStock > 0 ? `Mínimo: ${row.minStock.toFixed(2)}` : null,
          row.reorderQuantity > 0 ? `Reposición: ${row.reorderQuantity.toFixed(2)}` : null,
          row.recommendedOrder > 0 ? `Sugerido: ${row.recommendedOrder.toFixed(2)}` : null,
          row.allowNegative ? 'Permite saldo negativo' : null,
          row.assetStatus === 'OUT_ON_FIELD' && row.assetLastOutDate
            ? `Salida: ${new Date(row.assetLastOutDate).toLocaleDateString('es-PE')}`
            : null,
        ].filter(Boolean);
        const detailHtml =
          detailLines.length > 0
            ? detailLines.map(line => `<div class="detail-line">${line}</div>`).join('')
            : '<div class="detail-line">—</div>';

        return `<tr>
          <td class="text-center">${index + 1}</td>
          <td>
            <div class="material-name">${escapeHtml(displayName)}</div>
          </td>
          <td>${row.isCompanyAsset ? 'Activo' : 'Consumo'}</td>
          <td>${displayUnit !== '—' ? escapeHtml(displayUnit) : '—'}</td>
          <td class="numeric">${row.in.toFixed(2)}</td>
          <td class="numeric">${row.out.toFixed(2)}</td>
          <td class="numeric">${row.disponible.toFixed(2)}</td>
          <td>${escapeHtml(locationLabel)}</td>
          <td>${responsibleLabel && responsibleLabel !== '—' ? escapeHtml(responsibleLabel) : '—'}</td>
          <td class="text-center">${daysOut !== null ? `${daysOut} día(s)` : '—'}</td>
          <td><span class="${statusClass}">${statusLabel}</span></td>
          <td>${detailHtml}</td>
        </tr>`;
      })
      .join('');

    const summaryCards = [
      { label: 'Monitoreados', value: `${inventoryStats.total}` },
      { label: 'Bajo stock', value: `${inventoryStats.low}` },
      { label: 'Sin stock', value: `${inventoryStats.out}` },
      { label: 'Saldo negativo', value: `${inventoryStats.negative}` },
      { label: 'Activos en obra', value: `${inventoryStats.assetsOut}` },
      { label: 'Activos en almacén', value: `${inventoryStats.assetsInWarehouse}` },
      { label: 'Stock consumo (U)', value: inventoryStats.consumptionStock.toFixed(2) },
    ];

    const summaryHtml = summaryCards
      .map(
        card => `<div class="card">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
      </div>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Reporte de inventario</title>
    <style>
      @media print {
        body { margin: 0; }
      }
      body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
      .wrap { max-width: 1100px; margin: 0 auto; }
      h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -0.02em; }
      p.meta { margin: 0; color: #475569; font-size: 12px; }
      .summary-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
      .card { padding: 14px 16px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .card span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
      .card strong { display: block; font-size: 18px; margin-top: 4px; color: #0f172a; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }
      th { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; background: #f8fafc; }
      .numeric { text-align: right; font-variant-numeric: tabular-nums; }
      .text-center { text-align: center; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
      .badge-ok { background: #dcfce7; color: #15803d; }
      .badge-warn { background: #fef3c7; color: #b45309; }
      .badge-danger { background: #fee2e2; color: #b91c1c; }
      .material-name { font-weight: 600; }
      .detail-line { font-size: 10px; color: #475569; margin-bottom: 2px; }
      .detail-line:last-child { margin-bottom: 0; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Reporte de inventario</h1>
      <p class="meta"><strong>Obra:</strong> ${escapeHtml(obraNombre)} · <strong>Materiales listados:</strong> ${inventoryFiltered.length} · <strong>Generado:</strong> ${escapeHtml(generatedAt)}</p>
      <div class="summary-grid">
        ${summaryHtml}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th>Material</th>
            <th style="width:70px">Tipo</th>
            <th style="width:70px">Unidad</th>
            <th style="width:70px">Entradas</th>
            <th style="width:70px">Salidas</th>
            <th style="width:70px">Stock</th>
            <th style="width:90px">Ubicación</th>
            <th style="width:110px">Responsable</th>
            <th style="width:80px">Días fuera</th>
            <th style="width:90px">Estado</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </body>
</html>`;

    printDoc.open('text/html', 'replace');
    printDoc.write(html);
    printDoc.close();

    const triggerPrint = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 0);
    };

    if (printDoc.readyState === 'complete') {
      triggerPrint();
    } else {
      iframe.onload = triggerPrint;
      printDoc.addEventListener('DOMContentLoaded', triggerPrint, { once: true });
      setTimeout(triggerPrint, 800);
    }
  }, [inventoryFiltered, inventoryStats, obraById, obraId, resolveInventoryDisplay]);

  if (viewMode === 'INVENTORY') {
    const movesBtnClass = 'admin-button admin-button--ghost';
    const inventoryBtnClass = 'admin-button admin-button--primary';
    return (
      <div className="app-wrap">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 className="title">Inventario</h1>
            <p className="subtitle">Controla el stock por grupos, define mínimos y genera alertas para reposición.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={movesBtnClass}
              onClick={() => setViewMode('MOVES')}
            >
              Movimientos
            </button>
            <button type="button" className={inventoryBtnClass}>
              Inventario
            </button>
          </div>
        </div>

        <div className="kpis mt-4">
          <div><span>Monitoreados</span><strong>{inventoryStats.total}</strong></div>
          <div><span>Bajo stock</span><strong>{inventoryStats.low}</strong></div>
          <div><span>Sin stock</span><strong>{inventoryStats.out}</strong></div>
          <div><span>Saldo negativo</span><strong>{inventoryStats.negative}</strong></div>
          <div><span>Activos en obra</span><strong>{inventoryStats.assetsOut}</strong></div>
          <div><span>Activos en almacén</span><strong>{inventoryStats.assetsInWarehouse}</strong></div>
          <div><span>Stock consumo (U)</span><strong>{inventoryStats.consumptionStock.toFixed(2)}</strong></div>
        </div>

        <div className="card mt-4">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>Buscar</span>
              <input
                type="search"
                className="admin-input"
                placeholder="Material, código o grupo"
                value={inventoryQuery}
                onChange={(event) => setInventoryQuery(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>Grupo</span>
              <select
                className="admin-input"
                value={inventoryGroupFilter === 'ALL' ? '' : inventoryGroupFilter === 'UNGROUPED' ? 'ungrouped' : String(inventoryGroupFilter)}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '') setInventoryGroupFilter('ALL');
                  else if (value === 'ungrouped') setInventoryGroupFilter('UNGROUPED');
                  else setInventoryGroupFilter(Number(value));
                }}
              >
                <option value="">Todos</option>
                <option value="ungrouped">Sin grupo</option>
                {groupOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={inventoryShowLowOnly}
                onChange={(event) => setInventoryShowLowOnly(event.target.checked)}
              />
              <span>Solo alertas</span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>Tipo</span>
              <select
                className="admin-input"
                value={inventoryTypeFilter}
                onChange={(event) => setInventoryTypeFilter(event.target.value as 'ALL' | 'ASSETS' | 'CONSUMPTION')}
              >
                <option value="ALL">Todos</option>
                <option value="ASSETS">Solo activos</option>
                <option value="CONSUMPTION">Solo consumo</option>
              </select>
            </label>
            <div className="flex-1" />
            <button
              type="button"
              className="admin-button"
              onClick={loadInventorySnapshot}
              disabled={inventoryLoading}
            >
              {inventoryLoading ? 'Cargando…' : 'Actualizar'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={handlePrintInventory}
              disabled={inventoryFiltered.length === 0}
            >
              Imprimir
            </button>
          </div>
        </div>

        {inventoryError && (
          <div className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {inventoryError}
          </div>
        )}
        {inventoryAlert && (
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {inventoryAlert}
          </div>
        )}

        <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="card">
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-lg font-semibold text-slate-700">Stock por material</h2>
              <span className="text-xs text-slate-500">{inventoryFiltered.length} registros</span>
            </div>
            <div className="table-shell">
              <table className="w-full text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left">Material</th>
                    <th className="text-left">Unidad</th>
                    <th className="text-right">Entradas (U)</th>
                    <th className="text-right">Salidas (U)</th>
                    <th className="text-right">Stock (U)</th>
                    <th className="text-left">Ubicación / Responsable</th>
                    <th className="text-center">Días fuera</th>
                    <th className="text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryLoading ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500">Cargando inventario…</td>
                    </tr>
                  ) : inventoryFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-slate-500">Sin materiales en el filtro seleccionado.</td>
                    </tr>
                  ) : (
                    inventoryFiltered.map(row => {
                      const isSelected = selectedInventoryMaterialId === row.materialId;
                      const {
                        displayName,
                        displayCode,
                        displayUnit,
                        statusLabel,
                        statusClass,
                        isAsset,
                        locationLabel,
                        responsibleLabel,
                        daysOut,
                      } = resolveInventoryDisplay(row);
                      return (
                        <tr
                          key={row.materialId}
                          className={`${isSelected ? 'bg-blue-50' : ''} hover:bg-slate-50 cursor-pointer`}
                          onClick={() => handleSelectInventoryRow(row.materialId)}
                        >
                          <td className="font-medium text-slate-700">
                            <div className="flex flex-col">
                              <span>{displayName}</span>
                              {displayCode !== '—' && (
                                <span className="text-xs text-slate-400">Cod.: {displayCode}</span>
                              )}
                            </div>
                            <span
                              className={`ml-0 mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${
                                isAsset
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isAsset ? 'Activo' : 'Consumo'}
                            </span>
                          </td>
                          <td>{displayUnit}</td>
                          <td className="text-right tabular-nums">{row.in.toFixed(2)}</td>
                          <td className="text-right tabular-nums">{row.out.toFixed(2)}</td>
                          <td className="text-right tabular-nums">{row.disponible.toFixed(2)}</td>
                          <td className="text-sm text-slate-600">
                            <div>{locationLabel}</div>
                            {responsibleLabel && responsibleLabel !== '—' && (
                              <div className="text-xs text-slate-400">Resp.: {responsibleLabel}</div>
                            )}
                          </td>
                          <td className={`text-center tabular-nums ${daysOut !== null && daysOut > 3 ? 'text-rose-600 font-semibold' : ''}`}>
                            {daysOut !== null ? `${daysOut} día${daysOut === 1 ? '' : 's'}` : '—'}
                          </td>
                          <td className="text-center">
                            <span className={statusClass}>{statusLabel}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="mb-3 border-b border-slate-200 pb-2">
              <h2 className="text-lg font-semibold text-slate-700">Parámetros de stock</h2>
            </div>
            {selectedInventoryRow ? (
              <div className="space-y-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Nombre del material</span>
                  <input
                    className="admin-input"
                    value={materialDetailForm.name}
                    onChange={(event) => updateMaterialDetailField('name', event.target.value)}
                    placeholder="Ej. Carretilla reforzada, EPP casco"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Unidad</span>
                  <input
                    className="admin-input"
                    value={materialDetailForm.unit}
                    onChange={(event) => updateMaterialDetailField('unit', event.target.value)}
                    placeholder="Ej. kg, unidad, saco"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Grupo</span>
                  <select
                    className="admin-input"
                    value={materialDetailForm.groupId}
                    onChange={(event) => updateMaterialDetailField('groupId', event.target.value)}
                  >
                    <option value="">Sin grupo</option>
                    {groupOptions.map(option => (
                      <option key={option.value} value={String(option.value)}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Stock mínimo</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="admin-input"
                      value={materialDetailForm.minStock}
                      onChange={(event) => updateMaterialDetailField('minStock', event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Cantidad de reorden</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="admin-input"
                      value={materialDetailForm.reorderQuantity}
                      onChange={(event) => updateMaterialDetailField('reorderQuantity', event.target.value)}
                    />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={materialDetailForm.allowNegative}
                    onChange={(event) => updateMaterialDetailField('allowNegative', event.target.checked)}
                  />
                  <span>Permitir saldo negativo</span>
                </label>
                <div className="rounded bg-slate-100 px-3 py-2 text-xs text-slate-500">
                  <p>Stock actual: <strong className="text-slate-700">{selectedInventoryRow.disponible.toFixed(2)}</strong></p>
                  <p>Mínimo definido: <strong className="text-slate-700">{Number(materialDetailForm.minStock || 0).toFixed(2)}</strong></p>
                  <p>Sugerido a reponer: <strong className="text-slate-700">{selectedInventoryRow.recommendedOrder.toFixed(2)}</strong></p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="admin-button admin-button--primary"
                    onClick={handleSaveMaterialDetail}
                    disabled={materialDetailSaving}
                  >
                    {materialDetailSaving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button--ghost"
                    onClick={() => setSelectedInventoryMaterialId(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Selecciona un material para editar sus parámetros de stock.</p>
            )}
          </div>
        </div>

        <div className="card mt-4">
          <div className="mb-3 border-b border-slate-200 pb-2">
            <h2 className="text-lg font-semibold text-slate-700">Grupos de materiales</h2>
          </div>
          <form className="flex flex-wrap items-end gap-2 text-sm" onSubmit={handleCreateGroup}>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>Nombre del grupo</span>
              <input
                className="admin-input"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Ej. EPP, Acabados"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              <span>Grupo padre</span>
              <select
                className="admin-input"
                value={newGroupParentId === '' ? '' : String(newGroupParentId)}
                onChange={(event) => {
                  const value = event.target.value;
                  setNewGroupParentId(value === '' ? '' : Number(value));
                }}
              >
                <option value="">Raíz</option>
                {groupOptions.map(option => (
                  <option key={option.value} value={String(option.value)}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="admin-button admin-button--primary"
              disabled={creatingGroup}
            >
              {creatingGroup ? 'Creando…' : 'Crear grupo'}
            </button>
          </form>
          {groupAlert && (
            <p className="mt-2 text-xs text-slate-500">{groupAlert}</p>
          )}
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            <li className="flex items-center justify-between">
              <span>Sin grupo</span>
              <span className="tabular-nums text-slate-500">{ungroupedCount}</span>
            </li>
            {groupOptions.map(option => (
              <li key={option.value} className="flex items-center justify-between">
                <span>{option.label}</span>
                <span className="tabular-nums text-slate-500">{inventoryCountByGroup.get(option.value) ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const movesBtnClass = 'admin-button admin-button--primary';
  const inventoryBtnClass = 'admin-button admin-button--ghost';
  const hasWarehouseSearchTerm = warehouseSearch.trim().length > 0;
  const showWarehouseDropdown = warehouseSearchFocused && warehouseSearchResults.length > 0;
  const showWarehouseEmpty =
    warehouseSearchFocused &&
    hasWarehouseSearchTerm &&
    warehouseSearchResults.length === 0 &&
    !inventoryLoading;
  const showWarehouseLoading =
    warehouseSearchFocused &&
    inventoryLoading &&
    warehouseSearchResults.length === 0;

  return (
    <div className="app-wrap">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="title">Movimientos</h1>
          <p className="subtitle">Registra entradas y salidas, con fecha/hora automática.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={movesBtnClass}>
            Movimientos
          </button>
          <button
            type="button"
            className={inventoryBtnClass}
            onClick={() => setViewMode('INVENTORY')}
          >
            Inventario
          </button>
        </div>
      </div>

      {/* KPIs cortos */}
      <div className="kpis">
        <div><span>ENTRADAS (U)</span><strong>{unitSummary.entries}</strong></div>
        <div><span>SALIDAS (U)</span><strong>{unitSummary.exits}</strong></div>
        <div><span>SALDO (U)</span><strong>{unitSummary.balance}</strong></div>
        <div className="kpis-search-card">
          <span>Buscar en almacén</span>
          <div className="kpis-search__box">
            <input
              type="search"
              value={warehouseSearch}
              placeholder="Material o código"
              onChange={(event) => setWarehouseSearch(event.target.value)}
              onFocus={() => {
                setWarehouseSearchFocused(true);
                if (!inventoryRows.length && !inventoryLoading) {
                  loadInventorySnapshot();
                }
              }}
              onBlur={() => setWarehouseSearchFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && warehouseSearchResults.length > 0) {
                  event.preventDefault();
                  const next = warehouseSearchResults[0];
                  handleWarehouseQuickPick(next.materialId, { name: next.name, unit: next.unit });
                }
              }}
            />
            {showWarehouseDropdown && (
              <ul className="kpis-search__results">
                {warehouseSearchResults.map((result) => (
                  <li key={result.materialId}>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleWarehouseQuickPick(result.materialId, { name: result.name, unit: result.unit });
                      }}
                    >
                      <div className="kpis-search__title">
                        <strong>{result.name}</strong>
                        {result.code && <span>{result.code}</span>}
                      </div>
                      <div className="kpis-search__meta">
                        <span>
                          Stock:{' '}
                          {result.disponible.toLocaleString('es-PE', {
                            maximumFractionDigits: 2,
                          })}{' '}
                          {result.unit ?? 'U'}
                        </span>
                        <span>{INVENTORY_STATUS_LABEL[result.status]}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showWarehouseLoading && (
              <div className="kpis-search__empty">Cargando inventario…</div>
            )}
            {showWarehouseEmpty && (
              <div className="kpis-search__empty">Sin coincidencias.</div>
            )}
          </div>
          <p className="kpis-search__hint">
            Encuentra un material y se selecciona en el formulario y la tabla para actualizarlo al instante.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="card grid-2 moves-form">
        <div className="col">
          <label>Tipo *</label>
          <SearchableSelect<MoveType>
            value={type}
            options={MOVE_TYPE_OPTIONS}
            onChange={(selected) => {
              const next = selected ?? type;
              setType(next);
              if (next === 'OUT') {
                setUnitCost('');
                setProveedorId(null);
                setProveedorText('');
              } else {
                setDocType('FACTURA');
                setDocTaxable(true);
              }
            }}
            placeholder="IN u OUT"
          />
        </div>

        <div className="col">
          <label>Obra *</label>
          <SearchableSelect<number>
            value={typeof obraId === 'number' ? obraId : ''}
            options={obraOpts.map(opt => ({ value: opt.value, label: opt.label }))}
            onChange={(selected, input) => {
              if (selected !== null) {
                setObraId(selected);
                setFrenteId('');
              } else if (!input.trim()) {
                setObraId('');
                setFrenteId('');
              }
            }}
            placeholder="Escribe o selecciona una obra"
          />
        </div>

        <div className="col">
          <label>Frente (opcional)</label>
          <SearchableSelect<number>
            value={typeof frenteId === 'number' ? frenteId : ''}
            options={frenteOpts.map(opt => ({ value: opt.value, label: opt.label }))}
            onChange={(selected, input) => {
              if (selected !== null) {
                setFrenteId(selected);
              } else if (!input.trim()) {
                setFrenteId('');
              }
            }}
            placeholder="Selecciona o escribe el frente"
            disabled={typeof obraId !== 'number'}
          />
        </div>

        <div className="col">
          <label>Material * {disponible !== null && <small className="badge">Stock disp.: {disponible}</small>}</label>
          <input
            list="materials"
            placeholder="Escribe o elige de la lista"
            value={materialText}
            onChange={e => {
              setMaterialText(e.target.value);
              setMaterialId(null);
            }}
            ref={materialInputRef}
          />
          <datalist id="materials">
            {materiales
              .slice()
              .sort((a,b)=>a.name.localeCompare(b.name,'es'))
              .map(m => <option key={`${m.id}-${m.name}`} value={m.name} />)}
          </datalist>
        </div>

        <div className="col">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCompanyAsset}
              onChange={(e) => handleAssetToggle(e.target.checked)}
            />
            <span>Equipo propio de la empresa</span>
          </label>
          {isCompanyAsset && (
            <div className="asset-status-box">
              <span
                className={`status-pill ${assetStatus === 'OUT_ON_FIELD' ? 'danger' : 'success'}`}
              >
                {assetStatus === 'OUT_ON_FIELD' ? 'En operaciones' : 'En almacén'}
              </span>
              {currentResponsible && assetStatus === 'OUT_ON_FIELD' && (
                <small className="asset-note">Responsable actual: {currentResponsible}</small>
              )}
            </div>
          )}
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

        {isCompanyAsset && (
          <div className="col">
            <label>Responsable {type === 'OUT' ? '*' : '(opcional)'}</label>
            <input
              type="text"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              placeholder="Nombre completo del responsable"
            />
            {type === 'OUT' && assetStatus === 'OUT_ON_FIELD' && currentResponsible && (
              <small className="asset-note danger">
                Actualmente asignado a {currentResponsible}. Registra el retorno cuando vuelva al almacén.
              </small>
            )}
          </div>
        )}

        <div className="col">
          <label>Proveedor (solo IN)</label>
          <input
            list="providers"
            value={proveedorText}
            onChange={e => {
              setProveedorText(e.target.value);
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

        {type === 'IN' && (
          <>
            <div className="col">
              <label>Tipo de comprobante</label>
              <SearchableSelect<DocType>
                value={docType}
                options={DOC_TYPE_SELECT_OPTIONS}
                onChange={(selected, input) => {
                  const next = selected ?? (input.toUpperCase() as DocType);
                  if (DOC_TYPE_OPTIONS.includes(next)) {
                    setDocType(next);
                  }
                }}
                placeholder="Factura, Boleta, etc."
              />
            </div>
            <div className="col">
              <label>Serie</label>
              <input
                type="text"
                value={docSerie}
                onChange={(e) => setDocSerie(e.target.value.toUpperCase())}
                placeholder="F001"
                maxLength={12}
              />
            </div>
            <div className="col">
              <label>Número</label>
              <input
                type="text"
                value={docNumero}
                onChange={(e) => setDocNumero(e.target.value)}
                placeholder="00012345"
                maxLength={20}
              />
            </div>
            <div className="col">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={docTaxable}
                  onChange={(e) => setDocTaxable(e.target.checked)}
                  disabled={docType !== 'FACTURA'}
                />
                <span>Incluye IGV (crédito fiscal)</span>
              </label>
            </div>
          </>
        )}

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
            onChange={e => setNote(e.target.value.replace(/\s+/g, ' '))}
            placeholder="Ej: Retira Juan Pérez / compra inicial / salida a frente / etc."
          />
        </div>

        <div className="col-2 actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Guardando…' : `Guardar movimiento`}
          </button>
          <button
            type="button"
            onClick={() => {
              setMaterialText('');
              setMaterialId(null);
              setQuantity('');
              setUnitCost('');
              setProveedorText('');
              setProveedorId(null);
              setNote('');
              setDisponible(null);
              setDocSerie('');
              setDocNumero('');
              if (type === 'IN') {
                setDocType('FACTURA');
                setDocTaxable(true);
              } else {
                setDocType('OTRO');
                setDocTaxable(false);
              }
            }}
          >
            Limpiar
          </button>
          {msg && <span className="msg">{msg}</span>}
        </div>
      </form>

      {/* Filtros y export */}
      <div className="filters card">
        <div className="filters-group">
          <label>Ver:</label>
          <SearchableSelect<'ALL' | 'IN' | 'OUT'>
            value={filterType}
            options={[
              { value: 'ALL', label: 'Todos' },
              { value: 'IN', label: 'Entradas' },
              { value: 'OUT', label: 'Salidas' },
            ]}
            onChange={(selected) => {
              if (selected) setFilterType(selected);
            }}
            placeholder="Filtra por tipo"
          />
        </div>
        <div className="filters-group">
          <label>Rango:</label>
          <SearchableSelect<'DAY' | 'WEEK' | 'MONTH' | 'ALL'>
            value={filterRange}
            options={[
              { value: 'DAY', label: 'Hoy' },
              { value: 'WEEK', label: 'Semana' },
              { value: 'MONTH', label: 'Mes' },
              { value: 'ALL', label: 'Todos' },
            ]}
            onChange={(selected) => {
              if (selected) setFilterRange(selected);
            }}
            placeholder="Selecciona rango"
          />
        </div>
        <div className="filters-group filters-search">
          <label>Buscar material / código:</label>
          <input
            type="search"
            value={materialQuery}
            onChange={(event) => setMaterialQuery(event.target.value)}
            placeholder="Nombre, código, nota, responsable…"
          />
          {materialQuery.trim().length >= 2 && (
            <small className="filters-hint">
              {movesSearching
                ? 'Buscando en toda la historia…'
                : movesSearchError
                  ? `Error: ${movesSearchError}`
                  : movesSearchResults && movesSearchResults.length === 0
                    ? 'Sin movimientos con ese término.'
                    : movesSearchResults
                      ? `Mostrando ${movesSearchResults.length} coincidencia(s).`
                      : 'Coincidencias inmediatas.'}
            </small>
          )}
        </div>
        <div className="filters-total">
          <span>COSTO TOTAL (S/)</span>
          <strong>{fmtMoney(totalCost)}</strong>
        </div>
        <div className="spacer" />

        <div className="filters-actions">
          <button
            type="button"
            onClick={toggleEditMode}
            disabled={!editMode && !deleteUnlocked}
            title={
              !deleteUnlocked && !editMode
                ? 'Desbloquea en Seguridad para poder editar'
                : undefined
            }
          >
            {editMode ? 'Guardar edición' : 'Editar'}
          </button>

          <button onClick={exportCSV}>Exportar CSV</button>
          <button onClick={handlePrintMoves}>Imprimir</button>
        </div>
      </div>

      <h2 className="subtitle">Últimos movimientos</h2>
      {/* Tabla principal de movimientos — estilos en index.css bajo “Tabla ‘Últimos movimientos’” */}
      <div className="table-shell">
        <div className="table card">
          <div className="thead">
            <div>#</div>
            <div>Fecha</div>
            <div>Tipo</div>
            <div>Obra/Frente</div>
            <div>Material</div>
            <div className="num">Cant.</div>
            <div className="num">U. med.</div>
            <div className="num">C. unit</div>
            <div className="num">C. total</div>
            <div className="num">Ing. total</div>
            <div className="num">Saldo</div>
            <div>Responsable</div>
            <div>Estado</div>
            <div>Nota</div>
            <div>Acciones</div>
          </div>

          {displayRows.map((m) => {
            const isEditing = editMode && editingId === m.id;
            const isSelected = !editMode && selectedMaterialId === m.materialId;

            const mat = matById.get(m.materialId);
            const matName = mat?.name ?? `Mat ${m.materialId}`;
            const um = mat?.unit ?? '—';
            const unitCostValue = typeof m.unitCost === 'number' ? m.unitCost : null;
            const costoUnit =
              unitCostValue !== null ? fmtMoney(unitCostValue) : '—';
            const totalCostValue =
              typeof m.totalCost === 'number'
                ? m.totalCost
                : unitCostValue !== null
                  ? unitCostValue * m.quantity
                  : null;
            const costoTotal =
              typeof totalCostValue === 'number' ? fmtMoney(totalCostValue) : '—';
            const totals = totalsByMaterial.get(m.materialId);
            const ingresadoTotal = totals?.inU ?? 0;
            const saldoTotal = totals?.saldo ?? 0;

            const assetFlag = mat?.isCompanyAsset ?? false;
            const status = m.assetStatus ?? (assetFlag ? mat?.assetStatus ?? null : null);
            const moveResponsible = m.responsible ?? (assetFlag ? mat?.assetResponsible ?? '' : '');
            const statusLabel =
              status === 'OUT_ON_FIELD'
                ? 'En operaciones'
                : status === 'IN_WAREHOUSE'
                  ? 'En almacén'
                  : '—';
            const statusClass =
              status === 'OUT_ON_FIELD'
                ? 'status-pill danger'
                : status === 'IN_WAREHOUSE'
                  ? 'status-pill success'
                  : 'status-pill neutral';
            const rowAssetClass =
              status === 'OUT_ON_FIELD'
                ? 'asset-out'
                : status === 'IN_WAREHOUSE'
                  ? 'asset-in'
                  : '';

          const obraName = obraById.get(m.obraId) ?? `Obra ${m.obraId}`;
          const frenteName = m.frenteId
            ? frenteById.get(m.frenteId) ?? `Frente ${m.frenteId}`
            : '';
          const lugarObra = obraName;
          const lugarFrente = frenteName || null;

            return (
              <div
                key={m.id}
                className={`trow ${isEditing ? 'is-editing' : ''} ${isSelected ? 'is-selected' : ''} ${rowAssetClass}`}
                onClick={() => handleRowClick(m)}
                role={editMode ? 'button' : undefined}
                tabIndex={editMode ? 0 : undefined}
              >
                <div>{m.id}</div>
                <div>{fmtDatePE(m.date)}</div>
                <div className={m.type === 'IN' ? 'in' : 'out'}>{m.type}</div>
                <div className="wrap place">
                  <strong>{lugarObra}</strong>
                  {lugarFrente && <span>{lugarFrente}</span>}
                </div>

                {/* Material */}
                <div className="wrap">
                  {isEditing ? (
                    <input
                      list="materials"
                      value={draft.materialName}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, materialName: e.target.value }))
                      }
                      style={{ width: '100%' }}
                    />
                  ) : (
                    matName
                  )}
                </div>

                {/* Cantidad */}
                <div className="num">
                  {isEditing ? (
                    <input
                      type="number"
                      step="any"
                      value={draft.quantity}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, quantity: e.target.value }))
                      }
                      style={{ width: 90 }}
                    />
                  ) : (
                    m.quantity
                  )}
                </div>

                {/* U.Medida */}
                <div className="num">
                  {isEditing ? (
                    <input
                      value={draft.unit}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, unit: e.target.value }))
                      }
                      style={{ width: 90 }}
                    />
                  ) : (
                    um
                  )}
                </div>

                {/* Costo unit. */}
                <div className="num">
                  {isEditing ? (
                    m.type === 'IN' ? (
                      <input
                        type="number"
                        step="any"
                        value={draft.unitCost}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, unitCost: e.target.value }))
                        }
                        style={{ width: 110 }}
                      />
                    ) : (
                      costoUnit
                    )
                  ) : (
                    costoUnit
                  )}
                </div>

                {/* Costo total */}
                <div className="num">
                  {isEditing
                    ? m.type === 'IN' && draft.unitCost && draft.quantity
                      ? fmtMoney(Number(draft.unitCost) * Number(draft.quantity))
                      : costoTotal
                    : costoTotal}
                </div>

                {/* Ingresado total */}
                <div className="num">{ingresadoTotal}</div>

                {/* Saldo */}
                <div className="num">{saldoTotal}</div>

                <div className="wrap">
                  {isEditing ? (
                    <input
                      value={draft.responsible}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, responsible: e.target.value }))
                      }
                      placeholder="Responsable"
                      style={{ width: '100%' }}
                    />
                  ) : (
                    moveResponsible || '—'
                  )}
                </div>

                <div>
                  <span className={statusClass}>{statusLabel}</span>
                </div>

                {/* Nota */}
                <div className="wrap">
                  {isEditing ? (
                    <input
                      value={draft.note}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, note: e.target.value }))
                      }
                    />
                  ) : (
                    m.note ?? ''
                  )}
                </div>

                <div className="row-actions">
                  <button
                    type="button"
                    className={`danger ${!deleteUnlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={event => handleDeleteMove(m, event)}
                    disabled={loading || !deleteUnlocked}
                    title={deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar'}
                  >
                    Eliminar
                  </button>
                </div>

                {isEditing && (
                  <div className="edit-extra">
                    {m.type === 'IN' && (
                      <>
                        <label>
                          <span>Proveedor</span>
                          <input
                            list="providers"
                            value={draft.proveedorName}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, proveedorName: e.target.value }))
                            }
                            placeholder="Razón social"
                          />
                        </label>
                        <label>
                          <span>Tipo de comprobante</span>
                          <select
                            value={draft.docType}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                docType: e.target.value as DocType,
                                isTaxable:
                                  e.target.value === 'FACTURA' ? prev.isTaxable : false,
                              }))
                            }
                          >
                            {DOC_TYPE_OPTIONS.map((typeOption) => (
                              <option key={typeOption} value={typeOption}>
                                {typeOption}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Serie</span>
                          <input
                            value={draft.docSerie}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, docSerie: e.target.value }))
                            }
                            placeholder="F001"
                            maxLength={12}
                          />
                        </label>
                        <label>
                          <span>Número</span>
                          <input
                            value={draft.docNumero}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, docNumero: e.target.value }))
                            }
                            placeholder="00012345"
                            maxLength={20}
                          />
                        </label>
                        <label className={`igv-toggle ${draft.docType !== 'FACTURA' ? 'disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={draft.docType === 'FACTURA' ? draft.isTaxable : false}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                isTaxable:
                                  prev.docType === 'FACTURA' ? e.target.checked : false,
                              }))
                            }
                            disabled={draft.docType !== 'FACTURA'}
                          />
                          <span>Incluye IGV</span>
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {displayRows.length === 0 && (
            <div className="empty">Sin movimientos en el rango elegido.</div>
          )}
        </div>
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
