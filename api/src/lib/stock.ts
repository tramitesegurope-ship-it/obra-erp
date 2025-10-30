// src/lib/stock.ts
import prisma from '../db';
import { MoveType } from '@prisma/client';

type StockRow = {
  materialId: number;
  name: string | null;
  code: string | null;
  unit: string | null;
  in: number;
  out: number;
  disponible: number;
};

/**
 * Stock disponible global por obra/material.
 * MVP: ignora frenteId para que OUT consuma del total de la obra,
 * independientemente de dónde se hizo el IN.
 */
export async function stockDisponible(obraId: number, materialId: number): Promise<number> {
  const grouped = await prisma.move.groupBy({
    by: ['type'],
    where: { obraId, materialId }, // 👈 sin frenteId
    _sum: { quantity: true },
  });

  const sumIn  = grouped.find(g => g.type === MoveType.IN)?._sum.quantity  ?? 0;
  const sumOut = grouped.find(g => g.type === MoveType.OUT)?._sum.quantity ?? 0;

  return Number((sumIn - sumOut).toFixed(3));
}

/**
 * Stock consolidado por material.
 * Si proporcionas frenteId, filtra movimientos de ese frente (solo para reportes).
 * OJO: si tus IN entran sin frente (null), no contarán en el filtro por frente.
 */
export async function stockPorMaterial(obraId: number, frenteId?: number): Promise<StockRow[]> {
  const where: any = { obraId };
  if (typeof frenteId === 'number') where.frenteId = frenteId; // filtro solo para informes

  const grouped = await prisma.move.groupBy({
    by: ['materialId', 'type'],
    where,
    _sum: { quantity: true },
  });

  if (grouped.length === 0) return [];

  const materialIds = Array.from(new Set(grouped.map(g => g.materialId)));
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, name: true, code: true, unit: true },
  });
  const meta = new Map(materials.map(m => [m.id, m]));

  const acc = new Map<number, StockRow>();

  for (const g of grouped) {
    const base = acc.get(g.materialId) ?? {
      materialId: g.materialId,
      name: meta.get(g.materialId)?.name ?? null,
      code: meta.get(g.materialId)?.code ?? null,
      unit: meta.get(g.materialId)?.unit ?? null,
      in: 0,
      out: 0,
      disponible: 0,
    };

    const qty = g._sum.quantity ?? 0;
    if (g.type === MoveType.IN) base.in += qty;
    else base.out += qty;

    base.disponible = Number((base.in - base.out).toFixed(3));
    acc.set(g.materialId, base);
  }

  return Array.from(acc.values()).sort((a, b) => a.materialId - b.materialId);
}
