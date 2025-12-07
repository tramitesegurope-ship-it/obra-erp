import { QuotationBaselineItem } from '@prisma/client';
import { SupplierQuoteRow } from './types';

const ACCENT_REGEX = /[\u0300-\u036f]/g;

export interface BaselineIndexEntry {
  id: number;
  itemCode?: string | null;
  description: string;
  normalizedDescription: string;
  tokens: Set<string>;
  materialId?: number | null;
  sheetKey?: string | null;
}

export interface BaselineIndex {
  byCode: Map<string, BaselineIndexEntry>;
  bySheet: Map<string, BaselineIndexEntry[]>;
  entries: BaselineIndexEntry[];
}

export function normalizeCode(code?: string | null): string | null {
  if (!code) return null;
  const trimmed = code.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!trimmed) return null;
  const withoutTrailingZeros = trimmed.replace(/\.0+$/, '');
  return withoutTrailingZeros || trimmed;
}

export function normalizeText(input: string): string {
  return input
    .toUpperCase()
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): Set<string> {
  const norm = normalizeText(text);
  const tokens = norm.split(' ').filter(token => token && token.length > 2);
  return new Set(tokens);
}

function normalizeSheetName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function jaccardDetails(a: Set<string>, b: Set<string>): { score: number; overlap: number } {
  if (!a.size || !b.size) return { score: 0, overlap: 0 };
  let intersection = 0;
  a.forEach(token => {
    if (b.has(token)) intersection += 1;
  });
  const union = a.size + b.size - intersection;
  return { score: union ? intersection / union : 0, overlap: intersection };
}

const hasStrongOverlap = (a: Set<string>, b: Set<string>) => {
  const { overlap, score } = jaccardDetails(a, b);
  if (overlap >= 3) return true;
  return score >= 0.45;
};

export function buildBaselineIndex(items: Array<Pick<QuotationBaselineItem, 'id' | 'itemCode' | 'description' | 'materialId' | 'sheetName'>>): BaselineIndex {
  const byCode = new Map<string, BaselineIndexEntry>();
  const bySheet = new Map<string, BaselineIndexEntry[]>();
  const entries: BaselineIndexEntry[] = items.map(item => {
    const normalizedDescription = normalizeText(item.description);
    const sheetKey = normalizeSheetName(item.sheetName);
    const entry: BaselineIndexEntry = {
      id: item.id,
      itemCode: item.itemCode,
      description: item.description,
      normalizedDescription,
      tokens: tokenize(item.description),
      materialId: item.materialId,
      sheetKey,
    };
    const normalizedCode = normalizeCode(item.itemCode ?? undefined);
    if (normalizedCode) {
      byCode.set(normalizedCode, entry);
    }
    if (sheetKey) {
      const scoped = bySheet.get(sheetKey) ?? [];
      scoped.push(entry);
      bySheet.set(sheetKey, scoped);
    }
    return entry;
  });
  return { byCode, bySheet, entries };
}

export function matchBaseline(index: BaselineIndex, item: SupplierQuoteRow): { baselineId?: number; score: number } {
  const sheetKey = normalizeSheetName(item.sheetName);
  const scopedEntries = sheetKey ? index.bySheet.get(sheetKey) : undefined;
  const candidates = scopedEntries && scopedEntries.length ? scopedEntries : index.entries;
  const description = [item.description, item.offeredDescription].filter(Boolean).join(' ');
  const tokens = tokenize(description);
  const normalizedCode = normalizeCode(item.itemCode);
  if (normalizedCode) {
    const exact = index.byCode.get(normalizedCode);
    if (exact) {
      if (!hasStrongOverlap(tokens, exact.tokens)) {
        // ignore code match if descriptions do not share enough tokens
      } else if (!sheetKey || !exact.sheetKey || exact.sheetKey === sheetKey) {
        return { baselineId: exact.id, score: 1 };
      }
      const scopedExact = candidates.find(entry => normalizeCode(entry.itemCode ?? undefined) === normalizedCode);
      if (scopedExact) {
        if (hasStrongOverlap(tokens, scopedExact.tokens)) {
          return { baselineId: scopedExact.id, score: 1 };
        }
      }
    }
  }
  let bestScore = 0;
  let bestOverlap = 0;
  let bestId: number | undefined;
  candidates.forEach(entry => {
    const { score, overlap } = jaccardDetails(tokens, entry.tokens);
    if (score > bestScore || (score === bestScore && overlap > bestOverlap)) {
      bestScore = score;
      bestOverlap = overlap;
      bestId = entry.id;
    }
  });
  const overlapThreshold = bestOverlap >= 2 || bestScore >= 0.6;
  if (bestScore < 0.35 || !overlapThreshold) {
    return { score: bestScore };
  }
  return { baselineId: bestId, score: bestScore };
}
