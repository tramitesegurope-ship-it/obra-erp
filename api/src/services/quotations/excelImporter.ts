import * as XLSX from 'xlsx';
import { BaselineExcelRow, SupplierQuoteRow } from './types';

interface HeaderMap {
  itemCode?: number;
  description: number;
  unit?: number;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  providerCols: number[];
}

interface SupplierHeaderMap {
  itemCode?: number;
  description: number;
  offeredDescription?: number;
  brand?: number;
  unit?: number;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface SupplierParseOptions {
  supplierName?: string;
}

const PROVIDER_HEADER_REGEX = /(COTIZ|PRECIO\s+DE\s+VENTA)/;

interface HeaderHintOptions {
  preferEstudio?: boolean;
  preferRightmost?: boolean;
  disallowTotalKeyword?: boolean;
}

const SUPPLIER_HEADER_HINTS = {
  itemCode: ['ITEM', 'CODIGO'],
  description: [
    'ARTICULO OFERTADO',
    'ARTICULO LICITADO',
    'DESCRIPCION',
    'DESCRIPCION DE PARTIDAS',
    'PRODUCTO OFERTADO',
    'PRODUCTO',
    'DESCRIPCION SOLICITADA',
    'DESCRIPCION OFERTADA',
  ],
  offeredDescription: ['ARTICULO OFERTADO'],
  brand: ['MARCA', 'PAIS'],
  unit: ['UND', 'U.M', 'UNIDAD', 'UM'],
  quantity: ['METRADO', 'METRADO CANTIDAD', 'CANT'],
  unitPrice: [
    'PRECIO UNITARIO',
    'PRECIO',
    'COSTO UNITARIO',
    'COSTO',
    'PRECIO DE VENTA',
    'PRECIO PACTADO',
    'PRECIO DE CONTRATO',
    'SOLES',
    'P. UNITARIO',
    'PRECIO UNITARIO',
  ],
  totalPrice: ['SUB TOTAL', 'SUBTOTAL', 'TOTAL', 'VALOR', 'COSTO TOTAL', 'TOTAL'],
};

const BASE_HEADER_HINTS = {
  item: ['ITEM'],
  description: ['DESCRIPCION', 'DESCRIPCION DE PARTIDAS'],
  unit: ['UND', 'UNID'],
  quantity: ['ESTUDIO DEFINITIVO::METRADO', 'METRADO', 'METRADO CANTIDAD', 'CONTRACTUAL::METRADO', 'CANTIDAD'],
  unitPrice: ['COSTO UNITARIO', 'PRECIO DE CONTRATO', 'PRECIO PACTADO', 'PRECIO UNITARIO'],
  totalPrice: ['VALOR TOTAL', 'COSTO TOTAL', 'CONTRACTUAL::TOTAL', 'ESTUDIO DEFINITIVO::TOTAL', 'TOTAL'],
};

function scoreHeaderCell(cell: string, idx: number, options?: HeaderHintOptions) {
  let score = 0;
  const hasEstudioDef = cell.includes('ESTUDIO DEFINITIVO');
  const hasEstudio = cell.includes('ESTUDIO');
  const hasContractual = cell.includes('CONTRACTUAL');
  if (options?.preferEstudio) {
    if (hasEstudioDef) score += 10;
    else if (hasEstudio) score += 6;
    else if (hasContractual) score += 3;
  }
  if (options?.disallowTotalKeyword && cell.includes('TOTAL')) {
    score -= 8;
  }
  if (cell.includes('PRECIO DE VENTA') || cell.includes('DIFERENCIA')) {
    score -= 6;
  }
  if (options?.preferRightmost) {
    score += idx * 0.01;
  }
  return score;
}

function findBestHeaderIndex(normalized: string[], hints: string[], options?: HeaderHintOptions) {
  const matches = normalized
    .map((cell, idx) => ({ cell, idx }))
    .filter(entry => hints.some(hint => entry.cell.includes(hint)));
  if (!matches.length) return undefined;
  matches.sort((a, b) => {
    const diff = scoreHeaderCell(b.cell, b.idx, options) - scoreHeaderCell(a.cell, a.idx, options);
    if (diff !== 0) return diff;
    if (options?.preferRightmost) return b.idx - a.idx;
    return a.idx - b.idx;
  });
  return matches[0].idx;
}

function shouldSkipSheet(sheetName: string): boolean {
  const normalized = sheetName.trim().toUpperCase();
  if (!normalized) return false;
  if (normalized.includes('RESUMEN')) return true;
  if (normalized.startsWith('RES-') || normalized.startsWith('RES ') || normalized.startsWith('RES_')) return true;
  if (/^FP[\s-]/.test(normalized)) return true;
  if (normalized === 'RG' || normalized.startsWith('GG')) return true;
  return false;
}

function normalizeCell(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toString();
  return String(value).trim();
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function labelMentionsSoles(label: string): boolean {
  return /SOLES|S\/|PEN/.test(label);
}

function normalizeNameForMatch(value?: string): string {
  if (!value) return '';
  return normalizeLabel(value).replace(/[^A-Z0-9]/g, '');
}

function findHeaderIndex(row: string[], hints: string[]): number | undefined {
  const idx = row.findIndex(cell => hints.some(h => cell.includes(h)));
  return idx >= 0 ? idx : undefined;
}

function findSupplierColumn(rows: any[][], supplierName?: string) {
  if (!supplierName) return undefined;
  const target = normalizeNameForMatch(supplierName);
  if (!target) return undefined;
  const limit = Math.min(rows.length, 15);
  const candidates: Record<number, number> = {};
  for (let r = 0; r < limit; r += 1) {
    const row = rows[r];
    row.forEach((cell, idx) => {
      if (!cell) return;
      const norm = normalizeNameForMatch(normalizeCell(cell));
      if (norm && norm.includes(target)) {
        candidates[idx] = (candidates[idx] || 0) + 1;
      }
    });
  }
  const sorted = Object.entries(candidates)
    .sort((a, b) => b[1] - a[1])
    .map(([idx]) => Number(idx));
  return sorted[0];
}

function findPreferredUnitPriceIndex(normalized: string[]): number | undefined {
  const rawCandidates = normalized
    .map((cell, idx) => ({ cell, idx }))
    .filter(entry => SUPPLIER_HEADER_HINTS.unitPrice.some(hint => entry.cell.includes(hint)));
  if (!rawCandidates.length) return undefined;
  const filtered = rawCandidates.filter(entry => !entry.cell.includes('TOTAL'));
  const candidates = filtered.length ? filtered : rawCandidates;
  const scored = candidates.map(({ cell, idx }) => {
    let score = 0;
    if (/PRECIO|UNIT/.test(cell)) score += 3;
    if (labelMentionsSoles(cell)) score += 4;
    const prev = normalized[idx - 1] ?? '';
    const next = normalized[idx + 1] ?? '';
    if (labelMentionsSoles(prev)) score += 2;
    if (labelMentionsSoles(next)) score += 3;
    if (cell.includes('TOTAL')) score -= 5;
    score += idx * 0.01;
    return { idx, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.idx;
}

function findPreferredTotalPriceIndex(normalized: string[], unitPriceIdx?: number): number | undefined {
  const rawCandidates = normalized
    .map((cell, idx) => ({ cell, idx }))
    .filter(entry => SUPPLIER_HEADER_HINTS.totalPrice.some(hint => entry.cell.includes(hint)));
  if (!rawCandidates.length) return undefined;
  const scored = rawCandidates.map(({ cell, idx }) => {
    let score = 0;
    if (labelMentionsSoles(cell)) score += 6;
    if (mentionsUsd(cell)) score -= 5;
    if (typeof unitPriceIdx === 'number' && Number.isFinite(unitPriceIdx)) {
      const distance = idx - unitPriceIdx;
      if (distance >= 0) score += 3;
      if (distance === 1) score += 2;
      score -= Math.abs(distance) * 0.05;
    }
    score += idx * 0.01;
    return { idx, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.idx;
}

const mentionsSoles = (label: string) => label.includes('SOLES') || label.includes('PEN') || label.includes('S/');
const mentionsUsd = (label: string) =>
  label.includes('USD') || label.includes('US$') || label.includes('DOLAR') || label.includes('DOLARES');

function findSolesColumn(rows: any[][], baseIndex: number | undefined) {
  if (baseIndex === undefined) return undefined;
  const limit = Math.min(rows.length, 12);
  for (let r = 0; r < limit; r += 1) {
    const current = normalizeLabel(normalizeCell(rows[r][baseIndex] || ''));
    const next = normalizeLabel(normalizeCell(rows[r][baseIndex + 1] || ''));
    const prev = r > 0 ? normalizeLabel(normalizeCell(rows[r - 1][baseIndex] || '')) : '';
    const usdHint = mentionsUsd(current) || mentionsUsd(prev);
    const solesHint = mentionsSoles(next);
    if (usdHint && solesHint) {
      return baseIndex + 1;
    }
  }
  return undefined;
}

function combineHeaders(rowA: any[], rowB?: any[]) {
  const a = rowA.map(normalizeCell);
  const b = rowB ? rowB.map(normalizeCell) : [];
  const len = Math.max(a.length, b.length);
  const combined: string[] = [];
  for (let i = 0; i < len; i += 1) {
    const upper = normalizeLabel(a[i] || '');
    const lower = normalizeLabel(b[i] || '');
    const label = [upper, lower].filter(Boolean).join('::');
    combined.push(label);
  }
  return combined;
}

function detectBaselineHeaderFromCombined(normalized: string[]): HeaderMap | null {
  if (!normalized.some(cell => cell.includes('DESCRIPCION'))) return null;
  if (!normalized.some(cell => cell.includes('ITEM'))) return null;
  const map: Partial<HeaderMap> & { providerCols: number[] } = { providerCols: [] };
  const findByHints = (hints: string[], options?: HeaderHintOptions) =>
    findBestHeaderIndex(normalized, hints, options);
  map.description = findByHints(BASE_HEADER_HINTS.description);
  map.itemCode = findByHints(BASE_HEADER_HINTS.item);
  map.unit = findByHints(BASE_HEADER_HINTS.unit);
  map.quantity = findByHints(BASE_HEADER_HINTS.quantity, {
    preferEstudio: true,
    preferRightmost: true,
    disallowTotalKeyword: true,
  });
  map.unitPrice = findByHints(BASE_HEADER_HINTS.unitPrice);
  map.totalPrice = findByHints(BASE_HEADER_HINTS.totalPrice, {
    preferEstudio: true,
    preferRightmost: true,
  });
  if (
    map.quantity !== undefined
    && normalized[map.quantity]?.includes('ESTUDIO')
    && normalized[map.quantity + 1]?.includes('TOTAL')
  ) {
    map.totalPrice = map.quantity + 1;
  }
  normalized.forEach((cell, idx) => {
    if (PROVIDER_HEADER_REGEX.test(cell)) {
      map.providerCols.push(idx);
    }
  });
  if (map.description === undefined) return null;
  return map as HeaderMap;
}

function detectBaselineHeader(rows: any[][], index: number): { header: HeaderMap; span: number } | null {
  const current = rows[index];
  if (!current) return null;
  const next = rows[index + 1];
  if (next) {
    const combined = combineHeaders(current, next);
    const header = detectBaselineHeaderFromCombined(combined);
    if (header && header.quantity !== undefined) return { header, span: 2 };
  }
  const normalized = combineHeaders(current);
  const header = detectBaselineHeaderFromCombined(normalized);
  if (header && header.quantity !== undefined) return { header, span: 1 };
  return null;
}

function detectSupplierHeaderFromRows(rows: any[][]): SupplierHeaderMap | null {
  const map: SupplierHeaderMap = {} as SupplierHeaderMap;
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i];
    if (!row?.length) continue;
    const normalized = row.map(normalizeCell).map(cell => cell.toUpperCase());
    const next = rows[i + 1]?.map(normalizeCell).map(cell => cell.toUpperCase());
    const merged = normalized.map((cell, idx) => {
      const lower = next?.[idx];
      if (!cell) return lower || '';
      if (!lower) return cell;
      return `${cell}::${lower}`;
    });
    (Object.keys(SUPPLIER_HEADER_HINTS) as Array<keyof SupplierHeaderMap>).forEach(key => {
      if ((map as any)[key] !== undefined) return;
      if (key === 'description') {
        const idx = findHeaderIndex(merged, [
          'ARTICULO LICITADO',
          'DESCRIPCION',
          'DESCRIPCION DE PARTIDAS',
          'ARTICULO',
          'PRODUCTO OFERTADO',
          'PRODUCTO',
          'DESCRIPCION SOLICITADA',
          'DESCRIPCION OFERTADA',
        ]);
        if (idx !== undefined) {
          map.description = idx;
        }
        return;
      }
      const hints = SUPPLIER_HEADER_HINTS[key as keyof typeof SUPPLIER_HEADER_HINTS];
      if (!hints?.length) return;
      let idx: number | undefined;
      if (key === 'unitPrice') {
        idx = findPreferredUnitPriceIndex(merged);
      } else if (key === 'totalPrice') {
        idx = findPreferredTotalPriceIndex(merged, map.unitPrice);
      } else {
        idx = findHeaderIndex(merged, hints);
      }
      if (idx !== undefined) {
        (map as any)[key] = idx;
      }
    });
    if (map.description !== undefined && (map.unitPrice !== undefined || map.totalPrice !== undefined)) {
      break;
    }
  }
  if (map.description === undefined) return null;
  if (map.unitPrice === undefined && map.totalPrice === undefined) return null;
  return map;
}

function isSectionRow(row: any[], map: HeaderMap): boolean {
  const description = map.description !== undefined ? normalizeCell(row[map.description]) : '';
  if (!description) return false;
  const quantity = map.quantity !== undefined ? toNumber(row[map.quantity]) : null;
  const unitPrice = map.unitPrice !== undefined ? toNumber(row[map.unitPrice]) : null;
  const totalPrice = map.totalPrice !== undefined ? toNumber(row[map.totalPrice]) : null;
  return !isFiniteNumber(quantity) && !isFiniteNumber(unitPrice) && !isFiniteNumber(totalPrice);
}

function isSummaryDescription(description: string): boolean {
  if (!description) return false;
  const normalized = normalizeLabel(description);
  if (/^SUB[- ]?TOTAL/.test(normalized)) return true;
  if (normalized.startsWith('TOTAL ')) return true;
  if (normalized === 'TOTAL') return true;
  if (normalized.includes('TOTAL SUMINISTRO')) return true;
  if (normalized.includes('TOTAL ESTUDIO')) return true;
  if (normalized.includes('TOTAL PROVEDOR') || normalized.includes('TOTAL PROVEEDOR')) return true;
  return false;
}

function isProviderNameRow(row: any[], providerCols: number[]): boolean {
  if (!providerCols.length) return false;
  const hasText = providerCols.some(idx => normalizeCell(row[idx]).length > 1);
  if (!hasText) return false;
  const hasNumbers = row.some(value => typeof value === 'number');
  return hasText && !hasNumbers;
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  const str = String(value).trim();
  if (!str) return null;
  const normalized = str
    .replace(/[^0-9.,-]/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const num = Number(normalized);
  return Number.isNaN(num) ? null : num;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeSection(section: string): string {
  return section.replace(/:+$/, '').trim();
}

function updateSectionPath(current: string[], nextSection: string): string[] {
  const clean = sanitizeSection(nextSection);
  if (!clean) return current;
  const existingIdx = current.findIndex(label => label === clean);
  if (existingIdx >= 0) {
    return current.slice(0, existingIdx + 1);
  }
  const updated = [...current, clean];
  if (updated.length > 4) {
    return updated.slice(updated.length - 4);
  }
  return updated;
}

function normalizeItemCode(value?: string): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/[^0-9A-Za-z.\-]/g, '').replace(/^0+/, '');
  return clean || undefined;
}

function getString(row: any[], index?: number): string | undefined {
  if (index === undefined) return undefined;
  const value = normalizeCell(row[index]);
  return value || undefined;
}

function getDescriptionValue(row: any[], index?: number) {
  if (index === undefined) return undefined;
  const raw = getString(row, index);
  if (raw && /[A-Z]/i.test(raw)) return raw;
  const next = getString(row, index + 1);
  if (next && /[A-Z]/i.test(next)) return next;
  return raw || next;
}

export function parseBaselineWorkbook(filePath: string): BaselineExcelRow[] {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const items: BaselineExcelRow[] = [];
  workbook.SheetNames.forEach(sheetName => {
    if (shouldSkipSheet(sheetName)) return;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    let header: HeaderMap | null = null;
    let providerNames: Record<number, string> = {};
    let sectionPath: string[] = [];
    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx];
      if (!header) {
        const detection = detectBaselineHeader(rows, idx);
        if (detection) {
          header = detection.header;
          if (detection.span > 1) idx += detection.span - 1;
        }
        continue;
      }
      if (header.providerCols.length && isProviderNameRow(row, header.providerCols)) {
        header.providerCols.forEach(colIdx => {
          const label = normalizeCell(row[colIdx]);
          if (label) providerNames[colIdx] = label;
        });
        continue;
      }
      if (isSectionRow(row, header)) {
        const description = getDescriptionValue(row, header.description);
        if (description && !/SUB-?TOTAL/i.test(description)) {
          sectionPath = updateSectionPath(sectionPath, description);
        }
        continue;
      }
      const description = getDescriptionValue(row, header.description);
      if (!description) continue;
      const descriptionNorm = normalizeLabel(description);
      if (descriptionNorm.includes('DESCRIPCION DE PARTIDAS')) continue;
      if (!/[A-Z]/.test(descriptionNorm)) continue;
      const itemCode = normalizeItemCode(getString(row, header.itemCode));
      if (isSummaryDescription(description)) continue;
      const unit = getString(row, header.unit);
      const quantity = header.quantity !== undefined ? toNumber(row[header.quantity]) ?? undefined : undefined;
      const unitPrice = header.unitPrice !== undefined ? toNumber(row[header.unitPrice]) ?? undefined : undefined;
      const totalPriceFromSheet = header.totalPrice !== undefined ? toNumber(row[header.totalPrice]) ?? undefined : undefined;
      const totalPrice = totalPriceFromSheet ?? (isFiniteNumber(quantity) && isFiniteNumber(unitPrice) ? quantity! * unitPrice! : undefined);
      if (!isFiniteNumber(quantity) && !isFiniteNumber(unitPrice) && !isFiniteNumber(totalPrice)) {
        continue;
      }
      const providerQuotes: Record<string, number> = {};
      header.providerCols.forEach(colIdx => {
        const value = toNumber(row[colIdx]);
        if (value === null || Number.isNaN(value)) return;
        const label = providerNames[colIdx] || `Cotizacion ${colIdx}`;
        providerQuotes[label] = value;
      });
      items.push({
        sheetName,
        rowNumber: idx + 1,
        sectionPath: [...sectionPath],
        itemCode,
        description,
        unit,
        quantity,
        unitPrice,
        totalPrice,
        providerQuotes: Object.keys(providerQuotes).length ? providerQuotes : undefined,
      });
    }
  });
  return items;
}

function detectAdjacentTotalColumn(rows: any[][], unitCol: number) {
  const limit = Math.min(rows.length, 8);
  for (let r = 0; r < limit; r += 1) {
    const label = normalizeLabel(normalizeCell(rows[r][unitCol + 1] || ''));
    if (!label) continue;
    if (label.includes('TOTAL') || label.includes('SOLES')) {
      return unitCol + 1;
    }
  }
  return undefined;
}

export function parseSupplierWorkbook(filePath: string, options?: SupplierParseOptions): SupplierQuoteRow[] {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const items: SupplierQuoteRow[] = [];
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    let supplierColumn = findSupplierColumn(rows, options?.supplierName);
    const solesColumn = findSolesColumn(rows, supplierColumn);
    if (solesColumn !== undefined) {
      supplierColumn = solesColumn;
    }
    const supplierTotalColumn = supplierColumn !== undefined
      ? detectAdjacentTotalColumn(rows, supplierColumn)
      : undefined;
    let header: SupplierHeaderMap | null = detectSupplierHeaderFromRows(rows);
    const fallbackUnitPriceCol = header?.unitPrice !== undefined ? header.unitPrice : undefined;
    rows.forEach((row, idx) => {
      if (!header) {
        header = detectSupplierHeaderFromRows(rows.slice(idx, Math.min(rows.length, idx + 40)));
        if (!header) return;
      }
      const hasOfferedColumn = header.offeredDescription !== undefined;
      const description = getString(row, header.description);
      const offeredDescriptionRaw = getString(row, header.offeredDescription);
      const resolvedOfferedDescription = offeredDescriptionRaw ?? (!hasOfferedColumn ? description : undefined);
      const baseDescription = description || resolvedOfferedDescription;
      if (!baseDescription) return;
      const itemCodeRaw = getString(row, header.itemCode);
      if (itemCodeRaw && normalizeLabel(itemCodeRaw) === 'ITEM') return;
      const descNorm = normalizeLabel(baseDescription);
      if (descNorm.includes('DESCRIPCION DE PARTIDAS')) return;
      const useHeaderUnitPrice = () => (header.unitPrice !== undefined ? toNumber(row[header.unitPrice]) ?? undefined : undefined);
      const useHeaderTotalPrice = () => (header.totalPrice !== undefined ? toNumber(row[header.totalPrice]) ?? undefined : undefined);
      let unitPrice = supplierColumn !== undefined
        ? toNumber(row[supplierColumn]) ?? undefined
        : useHeaderUnitPrice();
      if (unitPrice === undefined || !Number.isFinite(unitPrice) || Math.abs(unitPrice) > 1e7) {
        unitPrice = useHeaderUnitPrice();
      }
      let totalPrice = supplierColumn !== undefined
        ? (supplierTotalColumn !== undefined ? toNumber(row[supplierTotalColumn]) ?? undefined : undefined)
        : useHeaderTotalPrice();
      if (totalPrice === undefined || !Number.isFinite(totalPrice) || Math.abs(totalPrice) > 1e9) {
        totalPrice = useHeaderTotalPrice();
      }
      const quantity = header.quantity !== undefined ? toNumber(row[header.quantity]) ?? undefined : undefined;
      const hasUnitPrice = typeof unitPrice === 'number' && Number.isFinite(unitPrice) && unitPrice !== 0;
      const hasTotalPrice = typeof totalPrice === 'number' && Number.isFinite(totalPrice) && totalPrice !== 0;
      if (!hasUnitPrice && !hasTotalPrice) {
        return;
      }
      const unit = getString(row, header.unit);
      const itemCode = normalizeItemCode(getString(row, header.itemCode));
      const brand = getString(row, header.brand);
      items.push({
        sheetName,
        rowNumber: idx + 1,
        itemCode,
        description: description ?? resolvedOfferedDescription ?? '',
        offeredDescription: resolvedOfferedDescription,
        brand,
        unit,
        quantity,
        unitPrice,
        totalPrice,
      });
    });
  });
  return items;
}
