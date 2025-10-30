export type MoveType = 'IN' | 'OUT';

export interface Obra { id: number; name: string; }
export interface Material { id: number; name: string; code?: string | null; unit?: string | null; }
export interface Proveedor { id: number; name: string; }
export interface Frente { id: number; name: string; obraId: number; }

export interface Move {
  id: number;
  obraId: number;
  frenteId?: number | null;
  materialId: number;
  proveedorId?: number | null;
  type: MoveType;
  quantity: number;
  unitCost?: number | null;
  date?: string;
  note?: string | null;
}

export interface MoveCreate {
  obraId: number;
  frenteId?: number | null;
  materialId: number;
  proveedorId?: number | null;
  type: MoveType;
  quantity: number;
  unitCost?: number | null;
  date?: string | null;
  note?: string | null;
}

export interface MoveCreated extends Move {
  balanceAfter?: number;
}
