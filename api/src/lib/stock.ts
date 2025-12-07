// src/lib/stock.ts
import prisma from '../db';
import { AssetStatus, MoveType, Prisma } from '@prisma/client';

export type StockStatus = 'OK' | 'LOW' | 'OUT' | 'NEGATIVE';

export type StockRow = {
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
  status: StockStatus;
  recommendedOrder: number;
  isCompanyAsset: boolean;
  assetStatus: AssetStatus | null;
  assetResponsible: string | null;
  assetLastOutDate: string | null;
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
type StockOptions = {
  groupId?: number | null;
  includeDescendants?: boolean;
};

async function collectGroupIds(rootId: number, includeDescendants: boolean): Promise<number[]> {
  if (!includeDescendants) return [rootId];
  const groups = await prisma.materialGroup.findMany({ select: { id: true, parentId: true } });
  const map = new Map<number, number | null>();
  groups.forEach(g => map.set(g.id, g.parentId ?? null));

  const queue: number[] = [rootId];
  const result = new Set<number>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (result.has(current)) continue;
    result.add(current);
    for (const [id, parent] of map.entries()) {
      if (parent === current && !result.has(id)) {
        queue.push(id);
      }
    }
  }
  return Array.from(result.values());
}

const toNumber = (value: Prisma.Decimal | number | null | undefined): number =>
  value ? Number(value.toString()) : 0;

const resolveStatus = (stock: number, minStock: number, allowNegative: boolean): StockStatus => {
  if (stock < 0) {
    return allowNegative ? 'NEGATIVE' : 'OUT';
  }
  if (stock === 0) return 'OUT';
  if (minStock > 0 && stock <= minStock) return 'LOW';
  return 'OK';
};

export async function stockPorMaterial(
  obraId: number,
  frenteId?: number,
  options: StockOptions = {},
): Promise<StockRow[]> {
  const { groupId, includeDescendants = true } = options;

  let groupIds: number[] | undefined;
  if (typeof groupId === 'number') {
    groupIds = await collectGroupIds(groupId, includeDescendants);
    if (groupIds.length === 0) {
      return [];
    }
  }

  const moveWhere: Prisma.MoveWhereInput = { obraId };
  if (typeof frenteId === 'number') moveWhere.frenteId = frenteId;
  if (groupIds && groupIds.length > 0) {
    moveWhere.material = { groupId: { in: groupIds } };
  }

  const grouped = await prisma.move.groupBy({
    by: ['materialId', 'type'],
    where: moveWhere,
    _sum: { quantity: true },
  });

  const materialIds = new Set(grouped.map(g => g.materialId));
  const materialWhere: Prisma.MaterialWhereInput = {
    OR: [
      { moves: { some: { obraId } } },
      { minStock: { gt: 0 } },
      { reorderQuantity: { gt: 0 } },
    ],
  };
  if (groupIds && groupIds.length > 0) {
    materialWhere.groupId = { in: groupIds };
  }

  if (materialIds.size > 0) {
    materialWhere.OR = [
      ...(materialWhere.OR ?? []),
      { id: { in: Array.from(materialIds.values()) } },
    ];
  }

  const materials = await prisma.material.findMany({
    where: materialWhere,
    include: {
      group: { select: { id: true, name: true, parentId: true, color: true } },
    },
    orderBy: { name: 'asc' },
  });
  if (materials.length === 0) return [];

  const meta = new Map(materials.map(m => [m.id, m]));

  const materialIdsList = materials.map(m => m.id);
  const lastOutMap = new Map<number, Date>();
  if (materialIdsList.length > 0) {
    const lastOutMoves = await prisma.move.findMany({
      where: {
        obraId,
        type: MoveType.OUT,
        materialId: { in: materialIdsList },
      },
      orderBy: [
        { materialId: 'asc' },
        { date: 'desc' },
        { id: 'desc' },
      ],
      select: { materialId: true, date: true },
    });
    for (const move of lastOutMoves) {
      if (!lastOutMap.has(move.materialId)) {
        lastOutMap.set(move.materialId, move.date);
      }
    }
  }

  const acc = new Map<number, StockRow>();

  for (const g of grouped) {
    const base = acc.get(g.materialId) ?? {
      materialId: g.materialId,
      name: meta.get(g.materialId)?.name ?? null,
      code: meta.get(g.materialId)?.code ?? null,
      unit: meta.get(g.materialId)?.unit ?? null,
      groupId: meta.get(g.materialId)?.groupId ?? null,
      groupName: meta.get(g.materialId)?.group?.name ?? null,
      groupParentId: meta.get(g.materialId)?.group?.parentId ?? null,
      groupColor: meta.get(g.materialId)?.group?.color ?? null,
      minStock: toNumber(meta.get(g.materialId)?.minStock ?? 0),
      reorderQuantity: toNumber(meta.get(g.materialId)?.reorderQuantity ?? 0),
      allowNegative: meta.get(g.materialId)?.allowNegative ?? false,
      in: 0,
      out: 0,
      disponible: 0,
      status: 'OK' as StockStatus,
      recommendedOrder: 0,
      isCompanyAsset: meta.get(g.materialId)?.isCompanyAsset ?? false,
      assetStatus: meta.get(g.materialId)?.isCompanyAsset
        ? meta.get(g.materialId)?.assetStatus ?? AssetStatus.IN_WAREHOUSE
        : null,
      assetResponsible: meta.get(g.materialId)?.isCompanyAsset
        ? meta.get(g.materialId)?.assetResponsible ?? null
        : null,
      assetLastOutDate: lastOutMap.get(g.materialId)?.toISOString() ?? null,
    };

    const qty = g._sum.quantity ?? 0;
    if (g.type === MoveType.IN) base.in += qty;
    else base.out += qty;

    base.disponible = Number((base.in - base.out).toFixed(3));
    acc.set(g.materialId, base);
  }

  // incluir materiales que no aparecieron en grouped (sin movimientos) pero tienen minStock/reorder > 0
  for (const material of materials) {
    if (acc.has(material.id)) continue;
    acc.set(material.id, {
      materialId: material.id,
      name: material.name,
      code: material.code ?? null,
      unit: material.unit ?? null,
      groupId: material.groupId ?? null,
      groupName: material.group?.name ?? null,
      groupParentId: material.group?.parentId ?? null,
      groupColor: material.group?.color ?? null,
      minStock: toNumber(material.minStock ?? 0),
      reorderQuantity: toNumber(material.reorderQuantity ?? 0),
      allowNegative: material.allowNegative ?? false,
      in: 0,
      out: 0,
      disponible: 0,
      status: 'OUT',
      recommendedOrder: 0,
      isCompanyAsset: material.isCompanyAsset ?? false,
      assetStatus: material.isCompanyAsset ? material.assetStatus ?? AssetStatus.IN_WAREHOUSE : null,
      assetResponsible: material.isCompanyAsset ? material.assetResponsible ?? null : null,
      assetLastOutDate: lastOutMap.get(material.id)?.toISOString() ?? null,
    });
  }

  for (const row of acc.values()) {
    row.status = resolveStatus(row.disponible, row.minStock, row.allowNegative);
    if (row.status === 'LOW' || row.status === 'OUT' || row.status === 'NEGATIVE') {
      const deficit = row.minStock > 0 ? Math.max(row.minStock - row.disponible, 0) : 0;
      row.recommendedOrder =
        row.reorderQuantity > 0
          ? Math.max(row.reorderQuantity, Number(deficit.toFixed(3)))
          : Number(deficit.toFixed(3));
    } else {
      row.recommendedOrder = 0;
    }
  }

  return Array.from(acc.values()).sort((a, b) => a.name.localeCompare(b.name ?? ''));
}
