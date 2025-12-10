import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import crypto from 'crypto';
import {
  Prisma,
  Quotation,
  QuotationAttachment,
  QuotationAttachmentType,
  QuotationProcess,
  QuotationStatus,
} from '@prisma/client';
import prisma from '../../db';
import { parseBaselineWorkbook, parseSupplierWorkbook, SupplierParseOptions } from './excelImporter';
import { BaselineExcelRow, SupplierQuoteRow } from './types';
import { buildBaselineIndex, matchBaseline } from './matcher';

const STORAGE_ROOT = process.env.QUOTATION_STORAGE_DIR
  ? path.resolve(process.env.QUOTATION_STORAGE_DIR)
  : path.resolve(process.cwd(), 'uploads', 'quotations');

interface ImportBaselineInput {
  name: string;
  code?: string;
  baseCurrency?: string;
  exchangeRate?: number;
  targetMarginPct?: number;
  notes?: string;
  filePath: string;
  originalName?: string;
}

interface SupplierImportInput {
  processId: number;
  proveedorId?: number;
  supplierName?: string;
  currency?: string;
  exchangeRate?: number;
  notes?: string;
  filePath: string;
  originalName?: string;
  replaceQuotationId?: number;
}

function ensureExistingFile(sourcePath: string): string {
  const abs = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(process.cwd(), sourcePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`No se encontró el archivo en la ruta ${sourcePath}`);
  }
  return abs;
}

async function ensureStorageDir() {
  await fsPromises.mkdir(STORAGE_ROOT, { recursive: true });
}

async function computeChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.xlsx' || ext === '.xls') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'application/octet-stream';
}

async function persistAttachment(
  tx: Prisma.TransactionClient,
  params: {
    absPath: string;
    type: QuotationAttachmentType;
    quotationId?: number;
    metadata?: Prisma.InputJsonValue;
    originalName?: string;
  },
) {
  await ensureStorageDir();
  const originalName = params.originalName?.trim() || path.basename(params.absPath);
  const destName = `${Date.now()}-${originalName.replace(/\s+/g, '_')}`;
  const destPath = path.join(STORAGE_ROOT, destName);
  await fsPromises.copyFile(params.absPath, destPath);
  const stats = await fsPromises.stat(destPath);
  const checksum = await computeChecksum(destPath);
  const relativePath = path.relative(process.cwd(), destPath);
  return tx.quotationAttachment.create({
    data: {
      quotationId: params.quotationId ?? null,
      type: params.type,
      originalName,
      storagePath: relativePath,
      mimeType: guessMime(originalName),
      sizeBytes: stats.size,
      checksum,
      metadata: params.metadata ?? undefined,
    },
  });
}

function decimal(value?: number | null): Prisma.Decimal | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Prisma.Decimal(value);
  }
  return null;
}

function toNumber(value?: Prisma.Decimal | null): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function convertCurrency(
  value: number | undefined,
  fromCurrency: string | undefined,
  toCurrency: string,
  exchangeRate?: number,
): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) return null;
  if (!fromCurrency || !fromCurrency.trim() || fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return value;
  }
  if (!exchangeRate || exchangeRate <= 0) return null;
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === 'USD' && to === 'PEN') return value * exchangeRate;
  if (from === 'PEN' && to === 'USD') return value / exchangeRate;
  return value * exchangeRate;
}

type UnitDimension = 'count' | 'length' | 'area';

const UNIT_ALIASES: Record<string, string> = {
  unidad: 'EA',
  unidades: 'EA',
  und: 'EA',
  u: 'EA',
  unit: 'EA',
  pieza: 'EA',
  pza: 'EA',
  ea: 'EA',
  m: 'M',
  metro: 'M',
  metros: 'M',
  mt: 'M',
  mts: 'M',
  km: 'KM',
  kilometro: 'KM',
  kilometros: 'KM',
  mm: 'MM',
  milimetro: 'MM',
  milimetros: 'MM',
  cm: 'CM',
  centimetro: 'CM',
  centimetros: 'CM',
  pulg: 'IN',
  pulgada: 'IN',
  pulgadas: 'IN',
  inch: 'IN',
  in: 'IN',
  pies: 'FT',
  pie: 'FT',
  ft: 'FT',
  m2: 'M2',
  mt2: 'M2',
  'm^2': 'M2',
};

const UNIT_DEFINITIONS: Record<string, { dimension: UnitDimension; baseValue: number }> = {
  EA: { dimension: 'count', baseValue: 1 },
  M: { dimension: 'length', baseValue: 1 },
  CM: { dimension: 'length', baseValue: 0.01 },
  MM: { dimension: 'length', baseValue: 0.001 },
  KM: { dimension: 'length', baseValue: 1000 },
  IN: { dimension: 'length', baseValue: 0.0254 },
  FT: { dimension: 'length', baseValue: 0.3048 },
  M2: { dimension: 'area', baseValue: 1 },
};

function normalizeUnitKey(value?: string | null): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;
  if (UNIT_ALIASES[key]) return UNIT_ALIASES[key];
  const upper = key.toUpperCase();
  if (UNIT_DEFINITIONS[upper]) return upper;
  return upper;
}

function convertUnitPriceValue(price: number, fromUnit?: string | null, toUnit?: string | null) {
  const fromKey = normalizeUnitKey(fromUnit);
  const toKey = normalizeUnitKey(toUnit);
  if (!fromKey || !toKey || fromKey === toKey) {
    return { price, converted: false };
  }
  const fromDef = UNIT_DEFINITIONS[fromKey];
  const toDef = UNIT_DEFINITIONS[toKey];
  if (!fromDef || !toDef || fromDef.dimension !== toDef.dimension) {
    return { price, converted: false };
  }
  const ratio = toDef.baseValue / fromDef.baseValue;
  return { price: price * ratio, converted: true };
}

function convertQuantityValue(quantity: number, fromUnit?: string | null, toUnit?: string | null) {
  const fromKey = normalizeUnitKey(fromUnit);
  const toKey = normalizeUnitKey(toUnit);
  if (!fromKey || !toKey || fromKey === toKey) {
    return { quantity, converted: false };
  }
  const fromDef = UNIT_DEFINITIONS[fromKey];
  const toDef = UNIT_DEFINITIONS[toKey];
  if (!fromDef || !toDef || fromDef.dimension !== toDef.dimension) {
    return { quantity, converted: false };
  }
  const ratio = fromDef.baseValue / toDef.baseValue;
  return { quantity: quantity * ratio, converted: true };
}

const normalizeIdentifier = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s+/g, ' ').toUpperCase();
};

const formatGuideNumber = (value?: string | null): string | null => {
  const normalized = normalizeIdentifier(value);
  if (!normalized) return null;
  return normalized.replace(/\s*([\-_/])\s*/g, '$1');
};

const collapseGuideNumberKey = (value?: string | null): string | null => {
  const formatted = formatGuideNumber(value);
  if (!formatted) return null;
  return formatted.replace(/[\s\-_/.,\\:;|+·]/g, '');
};

const sanitizeGuideNumberSql = Prisma.sql`
upper(
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          guideNumber, ' ', ''
                        ), '-', ''
                      ), '_', ''
                    ), '/', ''
                  ), '.', ''
                ), ',', ''
              ), '\\', ''
            ), ':', ''
          ), ';', ''
        ), '+', ''
      ), '|', ''
    ), '·', ''
  )
)
`;

const padOrderSequence = (sequence: number) => sequence.toString().padStart(3, '0');

const extractOrderSuffix = (label?: string | null) => {
  if (!label) return '';
  const idx = label.indexOf('/');
  if (idx >= 0) return label.slice(idx);
  const match = label.match(/[^0-9].*$/);
  return match ? match[0] : '';
};

const buildOrderNumber = (sequence: number, template?: string | null) => {
  const suffix = extractOrderSuffix(template);
  return `${padOrderSequence(sequence)}${suffix}`;
};

const assertOrderNumberAvailable = async (
  tx: Prisma.TransactionClient,
  orderNumber: string,
  excludeId?: number,
) => {
  const where: Prisma.PurchaseOrderLogWhereInput = {
    orderNumber: { equals: orderNumber, mode: 'insensitive' },
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const duplicate = await tx.purchaseOrderLog.findFirst({ where, select: { id: true } });
  if (duplicate) {
    throw new Error(`Ya existe una orden de compra con el número ${orderNumber} (ID ${duplicate.id}).`);
  }
};

const assertGuideNumberAvailable = async (guideNumber: string) => {
  const guideKey = collapseGuideNumberKey(guideNumber);
  if (!guideKey) return;
  const matches = await prisma.$queryRaw<{ id: number }[]>(
    Prisma.sql`
      SELECT id
      FROM "PurchaseDeliveryLog"
      WHERE guideNumber IS NOT NULL
        AND ${sanitizeGuideNumberSql} = ${guideKey}
      LIMIT 1
    `,
  );
  if (matches.length > 0) {
    throw new Error(`Ya registraste la guía ${guideNumber} (registro #${matches[0].id}).`);
  }
};

const assertQuotationSupplierAvailable = async (
  tx: Prisma.TransactionClient,
  options: { processId: number; proveedorId?: number | null; supplierName?: string | null; excludeId?: number },
) => {
  if (options.proveedorId) {
    const duplicate = await tx.quotation.findFirst({
      where: {
        processId: options.processId,
        proveedorId: options.proveedorId,
        id: options.excludeId ? { not: options.excludeId } : undefined,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error('El proveedor ya tiene una cotización registrada en este proceso.');
    }
  }
  if (options.supplierName) {
    const duplicate = await tx.quotation.findFirst({
      where: {
        processId: options.processId,
        supplierName: { equals: options.supplierName, mode: 'insensitive' },
        id: options.excludeId ? { not: options.excludeId } : undefined,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new Error(`Ya existe una cotización registrada para "${options.supplierName}".`);
    }
  }
};

async function deleteFileIfExists(storagePath?: string | null) {
  if (!storagePath) return;
  const absPath = path.isAbsolute(storagePath)
    ? storagePath
    : path.resolve(process.cwd(), storagePath);
  try {
    await fsPromises.unlink(absPath);
  } catch (err: any) {
    if (err && err.code !== 'ENOENT') {
      console.warn('No se pudo eliminar archivo', absPath, err);
    }
  }
}

function summarizeBaselineRows(rows: BaselineExcelRow[]) {
  const totalQuantity = rows.reduce((acc, row) => acc + (row.quantity ?? 0), 0);
  const totalCost = rows.reduce((acc, row) => acc + (row.totalPrice ?? (row.quantity ?? 0) * (row.unitPrice ?? 0)), 0);
  return { totalQuantity, totalCost };
}

function summarizeSupplierRows(rows: SupplierQuoteRow[]) {
  const count = rows.length;
  const total = rows.reduce((acc, row) => acc + (row.totalPrice ?? (row.quantity ?? 0) * (row.unitPrice ?? 0)), 0);
  return { count, total };
}

const priceFrom = (unit?: number | null, qty?: number | null, fallback?: number | null) => {
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
  if (typeof unit === 'number' && typeof qty === 'number') return unit * qty;
  return null;
};

export async function importBaselineProcess(input: ImportBaselineInput) {
  const absPath = ensureExistingFile(input.filePath);
  const rows = parseBaselineWorkbook(absPath);
  if (!rows.length) throw new Error('El Excel base no contiene items reconocibles.');

  const result = await prisma.$transaction(async tx => {
    const process = await tx.quotationProcess.create({
      data: {
        name: input.name.trim(),
        code: input.code?.trim() || null,
        baseCurrency: input.baseCurrency?.trim().toUpperCase() || 'PEN',
        exchangeRate: decimal(input.exchangeRate),
        targetMarginPct: decimal(input.targetMarginPct),
        notes: input.notes ?? null,
      },
    });

    const formattedRows = rows.map(row => ({
      processId: process.id,
      sheetName: row.sheetName,
      sectionPath: row.sectionPath.length ? row.sectionPath.join(' > ') : null,
      itemCode: row.itemCode ?? null,
      description: row.description,
      unit: row.unit ?? null,
      quantity: decimal(row.quantity ?? null),
      unitPrice: decimal(row.unitPrice ?? null),
      totalPrice: decimal(row.totalPrice ?? null),
      metadata: row.providerQuotes ? row.providerQuotes : null,
    }));

    if (formattedRows.length) {
      await tx.quotationBaselineItem.createMany({ data: formattedRows });
    }

    const attachment = await persistAttachment(tx, {
      absPath,
      type: QuotationAttachmentType.BASE_FILE,
      originalName: input.originalName,
      metadata: { tempPath: input.filePath, originalName: input.originalName },
    });

    await tx.quotationProcess.update({
      where: { id: process.id },
      data: { baselineFileId: attachment.id },
    });

    const summary = summarizeBaselineRows(rows);

    return {
      processId: process.id,
      baselineCount: rows.length,
      totals: summary,
      baseCurrency: process.baseCurrency,
    };
  });

  return result;
}

export async function importSupplierQuote(input: SupplierImportInput) {
  const absPath = ensureExistingFile(input.filePath);
  const rows = parseSupplierWorkbook(absPath, { supplierName: input.supplierName });
  if (!rows.length) throw new Error('La cotización no tiene filas válidas para importar.');

  const result = await prisma.$transaction(async tx => {
    const process = await tx.quotationProcess.findUnique({
      where: { id: input.processId },
      include: { baselines: true },
    });
    if (!process) throw new Error('Proceso de cotización no encontrado.');

    const fxFromInput = typeof input.exchangeRate === 'number' ? input.exchangeRate : undefined;
    const fxFromProcess = process.exchangeRate ? Number(process.exchangeRate) : undefined;
    let existingQuote: (Quotation & { attachments: QuotationAttachment[] }) | null = null;
    if (input.replaceQuotationId) {
      existingQuote = await tx.quotation.findUnique({
        where: { id: input.replaceQuotationId },
        include: { attachments: true },
      });
      if (!existingQuote) throw new Error('No se encontró la cotización a actualizar.');
      if (existingQuote.processId !== process.id) {
        throw new Error('La cotización seleccionada pertenece a otro proceso.');
      }
    }
    const supplierNameInput = input.supplierName?.trim();
    const cleanedSupplierNameInput = supplierNameInput && supplierNameInput.length ? supplierNameInput : undefined;
    const targetProveedorId = input.proveedorId ?? existingQuote?.proveedorId ?? null;
    const supplierNameValue = cleanedSupplierNameInput ?? existingQuote?.supplierName?.trim() ?? null;
    if (!existingQuote && !targetProveedorId && !supplierNameValue) {
      throw new Error('Debes indicar al menos el proveedor o el nombre del proveedor para registrar la cotización.');
    }
    await assertQuotationSupplierAvailable(tx, {
      processId: process.id,
      proveedorId: targetProveedorId,
      supplierName: supplierNameValue,
      excludeId: existingQuote?.id,
    });
    const quoteCurrency = (input.currency ?? existingQuote?.currency ?? process.baseCurrency ?? 'PEN').toUpperCase();
    const resolvedFx =
      fxFromInput
      ?? (existingQuote?.exchangeRate ? Number(existingQuote.exchangeRate) : undefined)
      ?? fxFromProcess;

    let quotation: Quotation & { attachments?: QuotationAttachment[] };
    let mode: 'CREATED' | 'UPDATED' = 'CREATED';
    const deletedAttachmentPaths: string[] = [];
    if (existingQuote) {
      mode = 'UPDATED';
      quotation = existingQuote;
      await tx.quotationItem.deleteMany({ where: { quotationId: quotation.id } });
      if (existingQuote.attachments.length) {
        const supplierFiles = existingQuote.attachments.filter(att => att.type === QuotationAttachmentType.SUPPLIER_FILE);
        if (supplierFiles.length) {
          await tx.quotationAttachment.deleteMany({
            where: { id: { in: supplierFiles.map(att => att.id) } },
          });
          deletedAttachmentPaths.push(...supplierFiles.map(att => att.storagePath));
        }
      }
      const nextSupplierName = supplierNameValue ?? existingQuote.supplierName ?? null;
      const nextNotes = input.notes !== undefined ? input.notes : existingQuote.notes;
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          proveedorId: targetProveedorId,
          supplierName: nextSupplierName,
          currency: quoteCurrency,
          exchangeRate: decimal(resolvedFx ?? null),
          notes: nextNotes ?? null,
        },
      });
      quotation = { ...quotation, supplierName: nextSupplierName ?? null, currency: quoteCurrency };
    } else {
      quotation = await tx.quotation.create({
        data: {
          processId: process.id,
          proveedorId: targetProveedorId,
          supplierName: supplierNameValue ?? null,
          currency: quoteCurrency,
          exchangeRate: decimal(resolvedFx ?? null),
          status: QuotationStatus.RECEIVED,
          notes: input.notes ?? null,
        },
      });
    }

    const baselineIndex = buildBaselineIndex(process.baselines);
    const baselineMap = new Map(process.baselines.map(item => [item.id, item] as const));

    let totalAmount = 0;
    let totalNormalized = 0;
    let matched = 0;

    const itemsPayload = rows.map(row => {
      const match = matchBaseline(baselineIndex, row);
      const baselineItem = match.baselineId ? baselineMap.get(match.baselineId) : null;
      const baselineQuantity = baselineItem ? toNumber(baselineItem.quantity) : null;
      const supplierQuantity = row.quantity ?? null;
      const effectiveQuantity = supplierQuantity ?? baselineQuantity ?? null;

      let adjustedUnitPrice = row.unitPrice ?? null;
      let conversionDetail: string | undefined;
      if (adjustedUnitPrice && baselineItem?.unit && row.unit) {
        const converted = convertUnitPriceValue(adjustedUnitPrice, row.unit, baselineItem.unit);
        if (converted.converted) {
          adjustedUnitPrice = converted.price;
          conversionDetail = `${row.unit}→${baselineItem.unit}`;
        }
      }

      const supplierRowTotal =
        row.totalPrice
        ?? (adjustedUnitPrice && supplierQuantity ? adjustedUnitPrice * supplierQuantity : null)
        ?? (adjustedUnitPrice && baselineQuantity ? adjustedUnitPrice * baselineQuantity : null)
        ?? ((row.unitPrice ?? 0) * (row.quantity ?? baselineQuantity ?? 0));
      if (Number.isFinite(supplierRowTotal)) totalAmount += supplierRowTotal as number;

      const normalizedUnit = convertCurrency(
        adjustedUnitPrice ?? row.unitPrice,
        quoteCurrency,
        process.baseCurrency,
        resolvedFx,
      );
      const normalizedTotal = (() => {
        if (row.totalPrice !== undefined && row.totalPrice !== null) {
          return convertCurrency(row.totalPrice, quoteCurrency, process.baseCurrency, resolvedFx);
        }
        if (normalizedUnit !== null && normalizedUnit !== undefined && supplierQuantity) {
          return normalizedUnit * supplierQuantity;
        }
        if (normalizedUnit !== null && normalizedUnit !== undefined && baselineQuantity) {
          return normalizedUnit * baselineQuantity;
        }
        return convertCurrency(supplierRowTotal, quoteCurrency, process.baseCurrency, resolvedFx);
      })();
      if (normalizedTotal !== null && normalizedTotal !== undefined && Number.isFinite(normalizedTotal)) {
        totalNormalized += normalizedTotal;
      }

      if (match.baselineId) matched += 1;

      const extras = (() => {
        const data: Record<string, unknown> = {};
        if (row.brand) data.brand = row.brand;
        if (row.offeredDescription) data.offeredDescription = row.offeredDescription;
        if (row.unit) data.originalUnit = row.unit;
        if (conversionDetail) data.unitConversion = conversionDetail;
        if (row.sheetName) data.sheetName = row.sheetName;
        if (typeof row.rowNumber === 'number') data.rowNumber = row.rowNumber;
        return Object.keys(data).length ? (data as Prisma.InputJsonValue) : undefined;
      })();

      return {
        quotationId: quotation.id,
        baselineItemId: match.baselineId ?? null,
        materialId: baselineItem?.materialId ?? null,
        sourceRow: row.rowNumber,
        itemCode: row.itemCode ?? null,
        description: row.description,
        unit: baselineItem?.unit ?? row.unit ?? null,
        quantity: decimal(effectiveQuantity ?? null),
        unitPrice: decimal(adjustedUnitPrice ?? row.unitPrice ?? null),
        totalPrice: decimal(row.totalPrice ?? null),
        currency: quoteCurrency,
        normalizedPrice: decimal(normalizedUnit ?? null),
        matchScore: match.score,
        extraAttributes: extras,
      };
    });

    if (itemsPayload.length) {
      await tx.quotationItem.createMany({ data: itemsPayload });
    }

    await tx.quotation.update({
      where: { id: quotation.id },
      data: {
        totalAmount: decimal(totalAmount),
        totalAmountPen: decimal(totalNormalized),
      },
    });

    await persistAttachment(tx, {
      absPath,
      type: QuotationAttachmentType.SUPPLIER_FILE,
      quotationId: quotation.id,
      originalName: input.originalName,
      metadata: { tempPath: input.filePath, originalName: input.originalName },
    });

    const summary = summarizeSupplierRows(rows);

    return {
      quotationId: quotation.id,
      importedItems: rows.length,
      matchedItems: matched,
      unmatchedItems: rows.length - matched,
      totals: {
        currency: quoteCurrency,
        amount: totalAmount,
        baseCurrency: process.baseCurrency,
        normalizedAmount: totalNormalized,
      },
      rawSummary: summary,
      mode,
      deletedAttachments: deletedAttachmentPaths,
    };
  });

  if (result.deletedAttachments?.length) {
    await Promise.all(result.deletedAttachments.map(deleteFileIfExists));
  }

  return {
    quotationId: result.quotationId,
    importedItems: result.importedItems,
    matchedItems: result.matchedItems,
    unmatchedItems: result.unmatchedItems,
    totals: result.totals,
    rawSummary: result.rawSummary,
    mode: result.mode,
  };
}

async function recomputeQuotationTotals(quotationId: number) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: { process: true, items: true },
  });
  if (!quotation) return null;
  const baseCurrency = quotation.process.baseCurrency;
  const fx = toNumber(quotation.exchangeRate) ?? undefined;
  let totalAmount = 0;
  let normalizedAmount = 0;
  quotation.items.forEach(item => {
    const qty = toNumber(item.quantity);
    const unitPrice = toNumber(item.unitPrice);
    const totalPrice = toNumber(item.totalPrice);
    const currency = item.currency || quotation.currency;
    const rowTotal =
      totalPrice ?? (qty != null && qty !== undefined && unitPrice != null ? qty * unitPrice : null);
    if (rowTotal != null && Number.isFinite(rowTotal)) {
      totalAmount += rowTotal;
    }
    const normalizedFromTotal = convertCurrency(rowTotal ?? undefined, currency, baseCurrency, fx);
    if (normalizedFromTotal != null && Number.isFinite(normalizedFromTotal)) {
      normalizedAmount += normalizedFromTotal;
      return;
    }
    if (qty != null && Number.isFinite(qty) && unitPrice != null && Number.isFinite(unitPrice)) {
      const normalizedUnit = convertCurrency(unitPrice, currency, baseCurrency, fx);
      if (normalizedUnit != null && Number.isFinite(normalizedUnit)) {
        normalizedAmount += normalizedUnit * qty;
      }
    }
  });
  await prisma.quotation.update({
    where: { id: quotation.id },
    data: {
      totalAmount: decimal(totalAmount),
      totalAmountPen: decimal(normalizedAmount),
    },
  });
  return { processId: quotation.processId };
}

export async function upsertManualQuotationItem(input: {
  quotationId: number;
  baselineId: number;
  unitPrice?: number;
  quantity?: number;
  totalPrice?: number;
  currency?: string;
}) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: input.quotationId },
    include: { process: true },
  });
  if (!quotation) throw new Error('Cotización no encontrada.');
  const baseline = await prisma.quotationBaselineItem.findUnique({
    where: { id: input.baselineId },
  });
  if (!baseline || baseline.processId !== quotation.processId) {
    throw new Error('El ítem base no pertenece a este proceso.');
  }
  const baseQuantity = toNumber(baseline.quantity);
  const quantity =
    typeof input.quantity === 'number' && Number.isFinite(input.quantity) && input.quantity > 0
      ? input.quantity
      : baseQuantity ?? null;
  const hasUnitPrice = typeof input.unitPrice === 'number' && Number.isFinite(input.unitPrice);
  const hasTotalPrice = typeof input.totalPrice === 'number' && Number.isFinite(input.totalPrice);
  if (!hasUnitPrice && !hasTotalPrice) {
    throw new Error('Ingresa el precio unitario o total para actualizar la oferta.');
  }
  const resolvedUnitPrice = hasUnitPrice ? input.unitPrice! : null;
  const resolvedTotal =
    hasTotalPrice && input.totalPrice !== undefined
      ? input.totalPrice!
      : resolvedUnitPrice != null && quantity
        ? resolvedUnitPrice * quantity
        : null;
  if (resolvedTotal == null && (!quantity || quantity <= 0)) {
    throw new Error('Define una cantidad para calcular el total.');
  }
  const finalQuantity = quantity ?? 1;
  const finalUnitPrice =
    resolvedUnitPrice != null
      ? resolvedUnitPrice
      : resolvedTotal != null && finalQuantity
        ? resolvedTotal / finalQuantity
        : null;
  const currency = (input.currency || quotation.currency || 'PEN').toUpperCase();
  const normalizedUnit =
    finalUnitPrice != null
      ? convertCurrency(finalUnitPrice, currency, quotation.process.baseCurrency, toNumber(quotation.exchangeRate) ?? undefined)
      : null;

  const existing = await prisma.quotationItem.findFirst({
    where: { quotationId: quotation.id, baselineItemId: baseline.id },
  });
  const payload = {
    description: baseline.description,
    unit: baseline.unit ?? null,
    quantity: decimal(finalQuantity ?? null),
    unitPrice: decimal(finalUnitPrice ?? null),
    totalPrice: decimal(resolvedTotal ?? null),
    currency,
    normalizedPrice: decimal(normalizedUnit ?? null),
    itemCode: baseline.itemCode ?? null,
  };
  const item = existing
    ? await prisma.quotationItem.update({
        where: { id: existing.id },
        data: payload,
      })
    : await prisma.quotationItem.create({
        data: {
          ...payload,
          quotationId: quotation.id,
          baselineItemId: baseline.id,
          materialId: baseline.materialId ?? null,
        },
      });
  await recomputeQuotationTotals(quotation.id);
  return {
    quotationId: quotation.id,
    baselineId: baseline.id,
    itemId: item.id,
    processId: quotation.processId,
  };
}

export async function listQuotationProcesses() {
  const processes = await prisma.quotationProcess.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { baselines: true, quotations: true },
      },
    },
  });
  return processes.map(proc => ({
    id: proc.id,
    name: proc.name,
    code: proc.code,
    status: proc.status,
    baseCurrency: proc.baseCurrency,
    exchangeRate: toNumber(proc.exchangeRate),
    baselineItems: proc._count.baselines,
    quotations: proc._count.quotations,
    createdAt: proc.createdAt,
  }));
}

function toPlainProcess(process: QuotationProcess & {
  baselines: any[];
  quotations: any[];
  baselineFile: any | null;
}) {
  return {
    id: process.id,
    name: process.name,
    code: process.code,
    status: process.status,
    baseCurrency: process.baseCurrency,
    exchangeRate: toNumber(process.exchangeRate),
    targetMarginPct: toNumber(process.targetMarginPct),
    notes: process.notes,
    createdAt: process.createdAt,
    baselineCount: process.baselines.length,
    quotationCount: process.quotations.length,
    baselineFile: process.baselineFile,
  };
}

export async function getQuotationProcessSummary(processId: number) {
  const process = await prisma.quotationProcess.findUnique({
    where: { id: processId },
    include: {
      baselineFile: true,
      baselines: true,
      quotations: {
        include: {
          proveedor: true,
          attachments: true,
          items: true,
        },
      },
    },
  });
  if (!process) throw new Error('Proceso de cotización no encontrado.');

  const baselineTotals = process.baselines.reduce(
    (acc, item) => {
      const qty = toNumber(item.quantity) ?? 0;
      const unitPrice = toNumber(item.unitPrice) ?? 0;
      return {
        quantity: acc.quantity + qty,
        cost: acc.cost + (qty * unitPrice || toNumber(item.totalPrice) || 0),
      };
    },
    { quantity: 0, cost: 0 },
  );

  const baselineValue = baselineTotals.cost || 0;

  const baselineMap = new Map(process.baselines.map(item => [item.id, item]));

  const materialComparison = process.baselines.map(base => {
    const sheetName = base.sheetName || 'Hoja';
    const sections = (base.sectionPath || '')
      .split('>')
      .map(part => part.trim())
      .filter(Boolean);
    const offers = process.quotations.map(quote => {
      const match = quote.items.find((item: any) => item.baselineItemId === base.id);
      if (!match) return null;
      const unitPrice = toNumber(match.unitPrice);
      const normalizedPrice = toNumber(match.normalizedPrice);
      const totalPrice = toNumber(match.totalPrice);
      const quantity = toNumber(match.quantity);
      const extra = (match.extraAttributes ?? {}) as Record<string, any>;
      const rowOrder =
        typeof extra.rowNumber === 'number'
          ? Number(extra.rowNumber)
          : typeof match.sourceRow === 'number'
            ? Number(match.sourceRow)
            : null;
      return {
        quotationId: quote.id,
        supplier: quote.supplierName || quote.proveedor?.name || 'Proveedor',
        unitPrice,
        normalizedPrice,
        totalPrice,
        quantity,
        currency: quote.currency,
        matchScore: match.matchScore,
        rowOrder,
        offeredDescription: typeof extra.offeredDescription === 'string' ? extra.offeredDescription : null,
      };
    }).filter(Boolean);
    const bestOffer = offers
      .filter(offer => offer?.normalizedPrice)
      .sort((a, b) => (a!.normalizedPrice ?? Infinity) - (b!.normalizedPrice ?? Infinity))[0] || null;
    return {
      baselineId: base.id,
      itemCode: base.itemCode,
      description: base.description,
      sheetName,
      sectionPath: sections,
      unit: base.unit,
      baseUnitPrice: toNumber(base.unitPrice),
      baseTotalPrice: toNumber(base.totalPrice),
      baseQuantity: toNumber(base.quantity),
      offers,
      bestOffer,
    };
  });

  const rankingMap = new Map<number, any>();
  process.quotations.forEach(quote => {
    const normalizedTotal = toNumber(quote.totalAmountPen) ?? toNumber(quote.totalAmount);
    const matchedIds = new Set<number>();
    quote.items.forEach((item: any) => {
      if (item.baselineItemId) matchedIds.add(item.baselineItemId);
    });
    const itemsMatched = matchedIds.size;
    const coveragePct = process.baselines.length
      ? itemsMatched / process.baselines.length
      : 0;
    const missing = Math.max(0, process.baselines.length - itemsMatched);
    const diffAmount = normalizedTotal != null && baselineValue
      ? normalizedTotal - baselineValue
      : null;
    const diffPct = diffAmount != null && baselineValue
      ? diffAmount / baselineValue
      : null;

    rankingMap.set(quote.id, {
      quotationId: quote.id,
      supplier: quote.supplierName || quote.proveedor?.name || 'Proveedor',
      currency: quote.currency,
      totalAmount: toNumber(quote.totalAmount),
      normalizedAmount: normalizedTotal ?? null,
      itemsMatched,
      missing,
      coveragePct,
      status: quote.status,
      diffAmount,
      diffPct,
    });
  });

  const rankings = Array.from(rankingMap.values()).sort(
    (a, b) => (a.normalizedAmount ?? Infinity) - (b.normalizedAmount ?? Infinity),
  );

  const winnerId = rankings[0]?.quotationId ?? null;

  const sectionAggregates = new Map<string, any>();
  const sheetAggregates = new Map<string, any>();

  const addAggregate = (
    sheetName: string,
    sectionPath: string[],
    total: number,
    quotation?: { quotationId: number; supplier: string },
  ) => {
    const sheetEntry = sheetAggregates.get(sheetName) || {
      sheetName,
      baseTotal: 0,
      suppliers: new Map<number, { quotationId: number; supplier: string; total: number }>(),
    };
    if (!sheetAggregates.has(sheetName)) sheetAggregates.set(sheetName, sheetEntry);
    if (quotation) {
      const supplierEntry = sheetEntry.suppliers.get(quotation.quotationId) || {
        quotationId: quotation.quotationId,
        supplier: quotation.supplier,
        total: 0,
      };
      supplierEntry.total += total;
      sheetEntry.suppliers.set(quotation.quotationId, supplierEntry);
    } else {
      sheetEntry.baseTotal += total;
    }

    const sectionKey = `${sheetName}::${sectionPath.join('>')}`;
    const sectionEntry = sectionAggregates.get(sectionKey) || {
      sheetName,
      sectionPath,
      baseTotal: 0,
      suppliers: new Map<number, { quotationId: number; supplier: string; total: number }>(),
    };
    if (!sectionAggregates.has(sectionKey)) sectionAggregates.set(sectionKey, sectionEntry);
    if (quotation) {
      const supplierEntry = sectionEntry.suppliers.get(quotation.quotationId) || {
        quotationId: quotation.quotationId,
        supplier: quotation.supplier,
        total: 0,
      };
      supplierEntry.total += total;
      sectionEntry.suppliers.set(quotation.quotationId, supplierEntry);
    } else {
      sectionEntry.baseTotal += total;
    }
  };

  materialComparison.forEach(item => {
    const baseTotal = priceFrom(item.baseUnitPrice, item.baseQuantity, item.baseTotalPrice);
    if (baseTotal) {
      addAggregate(item.sheetName, item.sectionPath, baseTotal);
    }
    item.offers.forEach(offer => {
      const offerTotal = priceFrom(offer.unitPrice, offer.quantity, offer.totalPrice);
      if (offerTotal) {
        addAggregate(item.sheetName, item.sectionPath, offerTotal, {
          quotationId: offer.quotationId,
          supplier: offer.supplier,
        });
      }
    });
  });

  const sectionSummaries = Array.from(sectionAggregates.values()).map(section => ({
    sheetName: section.sheetName,
    sectionPath: section.sectionPath,
    baseTotal: section.baseTotal,
    suppliers: Array.from(section.suppliers.values()),
  }));

  const sheetSummaries = Array.from(sheetAggregates.values()).map(sheet => ({
    sheetName: sheet.sheetName,
    baseTotal: sheet.baseTotal,
    suppliers: Array.from(sheet.suppliers.values()),
  }));

  return {
    process: toPlainProcess(process as any),
    baselineTotals,
    materialComparison,
    rankings,
    winnerId,
    sectionSummaries,
    sheetSummaries,
    quotations: process.quotations.map(quote => ({
      id: quote.id,
      supplier: quote.supplierName || quote.proveedor?.name || 'Proveedor',
      currency: quote.currency,
      items: quote.items.map(item => {
        const extras = (item.extraAttributes ?? {}) as Record<string, any>;
        const rowOrder =
          typeof extras.rowNumber === 'number'
            ? Number(extras.rowNumber)
            : typeof item.sourceRow === 'number'
              ? Number(item.sourceRow)
              : null;
        return {
          id: item.id,
          baselineId: item.baselineItemId ?? null,
          description: item.description,
          offeredDescription: typeof extras.offeredDescription === 'string' ? extras.offeredDescription : null,
          sheetName: typeof extras.sheetName === 'string' ? extras.sheetName : null,
          unit: item.unit ?? null,
          originalUnit: typeof extras.originalUnit === 'string' ? extras.originalUnit : null,
          quantity: toNumber(item.quantity),
          unitPrice: toNumber(item.unitPrice),
          totalPrice: toNumber(item.totalPrice),
          rowOrder,
          itemCode: item.itemCode ?? null,
        };
      }),
    })),
  };
}

type PurchaseOrderTotals = {
  subtotal?: number | null;
  discount?: number | null;
  netSubtotal?: number | null;
  igv?: number | null;
  total?: number | null;
  discountRate?: number | null;
};

type PurchaseOrderLineInput = {
  baselineId?: number | null;
  description: string;
  unit?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
  metadata?: Record<string, unknown>;
};

type PurchaseOrderLogPayload = {
  processId: number;
  quotationId?: number | null;
  supplierId?: number | null;
  supplierName?: string | null;
  orderNumber?: string | null;
  issueDate?: string | Date | null;
  currency?: string | null;
  totals?: PurchaseOrderTotals;
  snapshot?: Record<string, unknown> | null;
  lines?: PurchaseOrderLineInput[];
};

const mapPurchaseOrderLog = (order: any) => ({
  id: order.id,
  processId: order.processId,
  quotationId: order.quotationId ?? null,
  supplierId: order.supplierId ?? null,
  supplierName: order.supplierName,
  orderNumber: order.orderNumber,
  sequence: order.sequence,
  issueDate: order.issueDate,
  currency: order.currency,
  subtotal: toNumber(order.subtotal),
  discount: toNumber(order.discount),
  netSubtotal: toNumber(order.netSubtotal),
  igv: toNumber(order.igv),
  total: toNumber(order.total),
  createdAt: order.createdAt,
  snapshot: order.itemsJson ?? null,
  lines: Array.isArray(order.lines)
    ? order.lines.map((line: any) => ({
        id: line.id,
        baselineId: line.baselineId,
        description: line.description,
        unit: line.unit,
        quantity: toNumber(line.quantity),
        unitPrice: toNumber(line.unitPrice),
        metadata: line.metadata ?? null,
      }))
    : [],
});

export async function listPurchaseOrderLogs(processId: number) {
  const [orders, last] = await Promise.all([
    prisma.purchaseOrderLog.findMany({
      where: { processId },
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
      take: 50,
    }),
    prisma.purchaseOrderLog.findFirst({
      where: { processId },
      orderBy: { sequence: 'desc' },
    }),
  ]);
  const lastSequence = last?.sequence ?? 0;
  const nextSequence = lastSequence + 1;
  const nextOrderNumber = buildOrderNumber(nextSequence, last?.orderNumber);
  return {
    orders: orders.map(mapPurchaseOrderLog),
    nextSequence,
    nextOrderNumber,
  };
}

export async function createPurchaseOrderLog(input: PurchaseOrderLogPayload) {
  const payloadTotals = input.totals ?? {};
  const resolvedIssueDate = input.issueDate ? new Date(input.issueDate) : new Date();
  const resolvedCurrency = input.currency?.trim().toUpperCase() || 'PEN';
  const supplierName = input.supplierName?.trim() || 'Proveedor';

  const result = await prisma.$transaction(async tx => {
    const last = await tx.purchaseOrderLog.findFirst({
      orderBy: { sequence: 'desc' },
    });
    const sequence = (last?.sequence ?? 0) + 1;
    const autoOrderNumber = buildOrderNumber(sequence, input.orderNumber ?? last?.orderNumber);
    const normalizedOrderNumber = normalizeIdentifier(input.orderNumber ?? autoOrderNumber) ?? autoOrderNumber;
    await assertOrderNumberAvailable(tx, normalizedOrderNumber);

    const created = await tx.purchaseOrderLog.create({
      data: {
        processId: input.processId,
        quotationId: input.quotationId ?? null,
        supplierId: input.supplierId ?? null,
        supplierName,
        orderNumber: normalizedOrderNumber,
        sequence,
        issueDate: resolvedIssueDate,
        currency: resolvedCurrency,
        subtotal: decimal(payloadTotals.subtotal ?? null),
        discount: decimal(payloadTotals.discount ?? null),
        netSubtotal: decimal(payloadTotals.netSubtotal ?? null),
        igv: decimal(payloadTotals.igv ?? null),
        total: decimal(payloadTotals.total ?? null),
        totalsJson: Object.keys(payloadTotals).length ? (payloadTotals as Prisma.InputJsonValue) : undefined,
        itemsJson: input.snapshot ? (input.snapshot as Prisma.InputJsonValue) : undefined,
      },
    });

    const linesData = (input.lines ?? [])
      .map(line => ({
        orderId: created.id,
        baselineId: line.baselineId ?? null,
        description: line.description,
        unit: line.unit ?? null,
        quantity: decimal(line.quantity ?? null),
        unitPrice: decimal(line.unitPrice ?? null),
        totalPrice: decimal(
          line.totalPrice
            ?? (line.quantity && line.unitPrice ? line.quantity * line.unitPrice : null),
        ),
        metadata: line.metadata ? (line.metadata as Prisma.InputJsonValue) : undefined,
      }))
      .filter(line => line.description.trim().length);
    if (linesData.length) {
      await tx.purchaseOrderLine.createMany({ data: linesData });
    }

    const nextSequence = sequence + 1;
    const nextOrderNumber = buildOrderNumber(nextSequence, normalizedOrderNumber);

    return {
      order: mapPurchaseOrderLog({ ...created, lines: linesData }),
      nextSequence,
      nextOrderNumber,
    };
  });

  return result;
}

export async function updatePurchaseOrderLog(orderId: number, input: PurchaseOrderLogPayload) {
  const existing = await prisma.purchaseOrderLog.findUnique({
    where: { id: orderId },
    include: { lines: true },
  });
  if (!existing) throw new Error('Orden de compra no encontrada.');
  if (existing.processId !== input.processId) {
    throw new Error('La orden no pertenece al proceso indicado.');
  }
  const payloadTotals = input.totals ?? {};
  const resolvedIssueDate = input.issueDate ? new Date(input.issueDate) : existing.issueDate;
  const resolvedCurrency = input.currency?.trim().toUpperCase() || existing.currency;
  const supplierName = input.supplierName?.trim() || existing.supplierName || 'Proveedor';
  const providedOrderNumber = input.orderNumber?.trim();
  const nextOrderNumberValue = providedOrderNumber && providedOrderNumber.length
    ? providedOrderNumber
    : existing.orderNumber;
  const normalizedOrderNumber = normalizeIdentifier(nextOrderNumberValue) ?? nextOrderNumberValue;

  const result = await prisma.$transaction(async tx => {
    await assertOrderNumberAvailable(tx, normalizedOrderNumber, existing.id);
    await tx.purchaseOrderLine.deleteMany({ where: { orderId: existing.id } });
    const updated = await tx.purchaseOrderLog.update({
      where: { id: existing.id },
      data: {
        quotationId: input.quotationId ?? null,
        supplierId: input.supplierId ?? null,
        supplierName,
        orderNumber: normalizedOrderNumber,
        issueDate: resolvedIssueDate,
        currency: resolvedCurrency,
        subtotal: decimal(payloadTotals.subtotal ?? null),
        discount: decimal(payloadTotals.discount ?? null),
        netSubtotal: decimal(payloadTotals.netSubtotal ?? null),
        igv: decimal(payloadTotals.igv ?? null),
        total: decimal(payloadTotals.total ?? null),
        totalsJson: Object.keys(payloadTotals).length ? (payloadTotals as Prisma.InputJsonValue) : undefined,
        itemsJson: input.snapshot ? (input.snapshot as Prisma.InputJsonValue) : undefined,
      },
    });

    const linesData = (input.lines ?? [])
      .map(line => ({
        orderId: updated.id,
        baselineId: line.baselineId ?? null,
        description: line.description,
        unit: line.unit ?? null,
        quantity: decimal(line.quantity ?? null),
        unitPrice: decimal(line.unitPrice ?? null),
        totalPrice: decimal(
          line.totalPrice
            ?? (line.quantity && line.unitPrice ? line.quantity * line.unitPrice : null),
        ),
        metadata: line.metadata ? (line.metadata as Prisma.InputJsonValue) : undefined,
      }))
      .filter(line => line.description.trim().length);
    if (linesData.length) {
      await tx.purchaseOrderLine.createMany({ data: linesData });
    }

    return mapPurchaseOrderLog({ ...updated, lines: linesData });
  });

  return result;
}

type PurchaseDeliveryInput = {
  processId: number;
  orderId?: number | null;
  proveedorId?: number | null;
  supplierName?: string | null;
  guideNumber?: string | null;
  date?: string | Date | null;
  notes?: string | null;
  items: Array<{
    baselineId?: number | null;
    orderLineId?: number | null;
    description: string;
    unit?: string | null;
    quantity: number;
    notes?: string | null;
  }>;
};

export async function createPurchaseDelivery(input: PurchaseDeliveryInput) {
  if (!input.items.length) throw new Error('Una guía debe tener al menos un ítem.');
  const resolvedDate = input.date ? new Date(input.date) : new Date();
  const supplierName = input.supplierName?.trim() || 'Proveedor';
  const guideNumber = formatGuideNumber(input.guideNumber ?? null);
  if (guideNumber) {
    await assertGuideNumberAvailable(guideNumber);
  }

  const delivery = await prisma.purchaseDeliveryLog.create({
    data: {
      processId: input.processId,
      orderId: input.orderId ?? null,
      proveedorId: input.proveedorId ?? null,
      supplierName,
      guideNumber,
      date: resolvedDate,
      notes: input.notes ?? null,
      items: {
        create: input.items.map(item => ({
          baselineId: item.baselineId ?? null,
          orderLineId: item.orderLineId ?? null,
          description: item.description,
          unit: item.unit ?? null,
          quantity: decimal(item.quantity ?? null),
          notes: item.notes ?? null,
        })),
      },
    },
    include: { items: true },
  });

  return delivery;
}

export async function listPurchaseDeliveries(processId: number) {
  const deliveries = await prisma.purchaseDeliveryLog.findMany({
    where: { processId },
    orderBy: { date: 'desc' },
    include: {
      items: true,
      order: { select: { orderNumber: true } },
      proveedor: { select: { name: true } },
    },
    take: 20,
  });
  return deliveries.map(delivery => ({
    id: delivery.id,
    processId: delivery.processId,
    orderId: delivery.orderId,
    orderNumber: delivery.order?.orderNumber ?? null,
    supplierName: delivery.supplierName ?? delivery.proveedor?.name ?? 'Proveedor',
    guideNumber: delivery.guideNumber,
    date: delivery.date,
    notes: delivery.notes,
    items: delivery.items.map(item => ({
      id: item.id,
      baselineId: item.baselineId,
      description: item.description,
      unit: item.unit,
      quantity: toNumber(item.quantity),
      notes: item.notes,
    })),
  }));
}

export async function deletePurchaseDelivery(processId: number, deliveryId: number) {
  const delivery = await prisma.purchaseDeliveryLog.findFirst({
    where: { id: deliveryId, processId },
    select: { id: true },
  });
  if (!delivery) {
    throw new Error('No se encontró la guía a eliminar.');
  }
  await prisma.purchaseDeliveryLog.delete({ where: { id: deliveryId } });
  return { ok: true };
}

const normalizeProgressDescription = (value?: string | null) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const buildProgressKey = (description?: string | null, unit?: string | null) => {
  const normalized = normalizeProgressDescription(description);
  const unitKey = unit ? unit.trim().toLowerCase() : '';
  return `${normalized}::${unitKey}`;
};

type ProgressAggregate = {
  key: string;
  baselineIds: number[];
  description: string;
  unit: string | null;
  sheetNames: Set<string>;
  sectionPaths: Set<string>;
  required: number;
  ordered: number;
  received: number;
};

export async function computePurchaseProgress(processId: number) {
  const [baselines, orderLines, deliveryItems] = await Promise.all([
    prisma.quotationBaselineItem.findMany({
      where: { processId },
      select: {
        id: true,
        description: true,
        unit: true,
        quantity: true,
        sheetName: true,
        sectionPath: true,
      },
    }),
    prisma.purchaseOrderLine.findMany({
      where: { order: { processId } },
      select: {
        baselineId: true,
        quantity: true,
        unit: true,
        order: { select: { quotationId: true } },
      },
    }),
    prisma.purchaseDeliveryItem.findMany({
      where: { delivery: { processId } },
      select: {
        baselineId: true,
        quantity: true,
        unit: true,
        delivery: {
          select: {
            order: { select: { quotationId: true } },
          },
        },
      },
    }),
  ]);

  const aggregates = new Map<string, ProgressAggregate>();
  const baselineToKey = new Map<number, string>();
  const baselineUnitMap = new Map<number, string | null>();
  baselines.forEach(item => {
    const key = buildProgressKey(item.description, item.unit);
    baselineToKey.set(item.id, key);
    baselineUnitMap.set(item.id, item.unit ?? null);
    const existing = aggregates.get(key);
    if (existing) {
      existing.baselineIds.push(item.id);
      if (item.sheetName) existing.sheetNames.add(item.sheetName);
      if (item.sectionPath) existing.sectionPaths.add(item.sectionPath);
      existing.required += Number(item.quantity ?? 0);
    } else {
      aggregates.set(key, {
        key,
        baselineIds: [item.id],
        description: item.description,
        unit: item.unit ?? null,
        sheetNames: new Set(item.sheetName ? [item.sheetName] : []),
        sectionPaths: new Set(item.sectionPath ? [item.sectionPath] : []),
        required: Number(item.quantity ?? 0),
        ordered: 0,
        received: 0,
      });
    }
  });

  const quotationUnitMap = new Map<string, string>();
  const baselineSupplierUnitMap = new Map<number, string>();
  const quotationItems = await prisma.quotationItem.findMany({
    where: {
      quotation: { processId },
      baselineItemId: { not: null },
    },
    select: {
      quotationId: true,
      baselineItemId: true,
      extraAttributes: true,
    },
  });
  quotationItems.forEach(item => {
    if (!item.baselineItemId) return;
    const extras = (item.extraAttributes ?? {}) as Record<string, any>;
    const originalUnit =
      typeof extras.originalUnit === 'string' && extras.originalUnit.trim()
        ? extras.originalUnit
        : null;
    if (!originalUnit) return;
    if (item.quotationId) {
      quotationUnitMap.set(`${item.quotationId}:${item.baselineItemId}`, originalUnit);
    }
    if (!baselineSupplierUnitMap.has(item.baselineItemId)) {
      baselineSupplierUnitMap.set(item.baselineItemId, originalUnit);
    }
  });

  const resolveProviderUnit = (
    fallbackUnit?: string | null,
    baselineId?: number | null,
    quotationId?: number | null,
  ) => {
    if (baselineId && quotationId) {
      const mapped = quotationUnitMap.get(`${quotationId}:${baselineId}`);
      if (mapped) return mapped;
    }
    if (baselineId && baselineSupplierUnitMap.has(baselineId)) {
      return baselineSupplierUnitMap.get(baselineId) ?? fallbackUnit ?? null;
    }
    return fallbackUnit ?? null;
  };

  orderLines.forEach(line => {
    if (!line.baselineId) return;
    const key = baselineToKey.get(line.baselineId);
    if (!key) return;
    const agg = aggregates.get(key);
    if (!agg) return;
    const baselineUnit = baselineUnitMap.get(line.baselineId) ?? agg.unit;
    const providerUnit = resolveProviderUnit(line.unit, line.baselineId, line.order?.quotationId);
    const converted = convertQuantityValue(
      Number(line.quantity ?? 0),
      providerUnit ?? undefined,
      baselineUnit ?? undefined,
    );
    agg.ordered += converted.quantity;
  });

  deliveryItems.forEach(item => {
    if (!item.baselineId) return;
    const key = baselineToKey.get(item.baselineId);
    if (!key) return;
    const agg = aggregates.get(key);
    if (!agg) return;
    const baselineUnit = baselineUnitMap.get(item.baselineId) ?? agg.unit;
    const providerUnit = resolveProviderUnit(
      item.unit,
      item.baselineId,
      item.delivery?.order?.quotationId,
    );
    const converted = convertQuantityValue(
      Number(item.quantity ?? 0),
      providerUnit ?? undefined,
      baselineUnit ?? undefined,
    );
    agg.received += converted.quantity;
  });

  const rows = Array.from(aggregates.values()).map(entry => {
    const required = entry.required;
    const ordered = entry.ordered;
    const received = entry.received;
    const orderPct = required ? Math.min(ordered / required, 1) : ordered > 0 ? 1 : 0;
    const receivePct = ordered ? Math.min(received / ordered, 1) : received > 0 ? 1 : 0;
    return {
      key: entry.key,
      baselineId: entry.baselineIds[0] ?? null,
      baselineIds: entry.baselineIds,
      description: entry.description,
      unit: entry.unit,
      sheetName: entry.sheetNames.size === 1 ? Array.from(entry.sheetNames)[0] : null,
      sheetNames: Array.from(entry.sheetNames),
      sectionPath: entry.sectionPaths.size === 1 ? Array.from(entry.sectionPaths)[0] : null,
      required,
      ordered,
      received,
      orderPct,
      receivePct,
      pendingOrder: Math.max(required - ordered, 0),
      pendingReceive: Math.max(ordered - received, 0),
    };
  });

  return rows;
}

export async function deleteQuotationProcess(processId: number) {
  const existing = await prisma.quotationProcess.findUnique({
    where: { id: processId },
    include: { baselineFile: true },
  });
  if (!existing) throw new Error('Proceso de cotización no encontrado');

  const attachmentWhere = existing.baselineFileId
    ? {
        OR: [{ id: existing.baselineFileId }, { quotation: { processId } }],
      }
    : { quotation: { processId } };

  const attachments = await prisma.quotationAttachment.findMany({ where: attachmentWhere });

  await prisma.$transaction(async tx => {
    if (attachments.length) {
      await tx.quotationAttachment.deleteMany({ where: { id: { in: attachments.map(a => a.id) } } });
    }
    await tx.quotationProcess.delete({ where: { id: processId } });
  });

  await Promise.all(attachments.map(att => deleteFileIfExists(att.storagePath)));

  return { ok: true };
}

export async function deleteSupplierQuotation(quotationId: number, options?: { force?: boolean }) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      attachments: true,
      purchaseOrders: { select: { id: true } },
    },
  });
  if (!quotation) throw new Error('Cotización no encontrada.');
  if (quotation.purchaseOrders.length && !options?.force) {
    throw new Error('No se puede eliminar la cotización porque tiene órdenes de compra registradas.');
  }

  const attachmentPaths = quotation.attachments.map(att => att.storagePath);

  await prisma.$transaction(async tx => {
    if (quotation.purchaseOrders.length) {
      const orderIds = quotation.purchaseOrders.map(order => order.id);
      if (orderIds.length) {
        await tx.purchaseDeliveryLog.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.purchaseOrderLog.deleteMany({ where: { id: { in: orderIds } } });
      }
    }
    await tx.quotationItem.deleteMany({ where: { quotationId } });
    await tx.quotationAttachment.deleteMany({ where: { quotationId } });
    await tx.quotation.delete({ where: { id: quotationId } });
  });

  await Promise.all(attachmentPaths.map(deleteFileIfExists));
  return { ok: true };
}
