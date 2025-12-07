import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import {
  importBaselineProcess,
  importSupplierQuote,
  listQuotationProcesses,
  getQuotationProcessSummary,
  deleteQuotationProcess,
  listPurchaseOrderLogs,
  createPurchaseOrderLog,
  updatePurchaseOrderLog,
  deleteSupplierQuotation,
  computePurchaseProgress,
  createPurchaseDelivery,
  listPurchaseDeliveries,
  upsertManualQuotationItem,
} from '../services/quotations/service';

const router = Router();

const TMP_DIR = path.resolve(process.cwd(), 'uploads/tmp');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 30 * 1024 * 1024 },
});

const cleanupTemp = async (filePath?: string) => {
  if (!filePath) return;
  try {
    await fsPromises.unlink(filePath);
  } catch (err) {
    console.warn('No se pudo eliminar archivo temporal', err);
  }
};

const BaseImportSchema = z.object({
  name: z.string().min(3),
  code: z.string().optional(),
  baseCurrency: z.string().min(3).optional(),
  exchangeRate: z.coerce.number().positive().optional(),
  targetMarginPct: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const SupplierImportSchema = z.object({
  proveedorId: z.coerce.number().int().positive().optional(),
  supplierName: z.string().optional(),
  currency: z.string().optional(),
  exchangeRate: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
  quotationId: z.coerce.number().int().positive().optional(),
});
const ManualQuoteSchema = z.object({
  baselineId: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  quantity: z.coerce.number().nonnegative().optional(),
  totalPrice: z.coerce.number().nonnegative().optional(),
  currency: z.string().optional(),
});

type BaseImportPayload = z.infer<typeof BaseImportSchema>;
type SupplierImportPayload = z.infer<typeof SupplierImportSchema>;
const PurchaseOrderSaveSchema = z.object({
  quotationId: z.number().int().positive().optional(),
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().optional(),
  orderNumber: z.string().optional(),
  issueDate: z.string().optional(),
  currency: z.string().optional(),
  totals: z
    .object({
      subtotal: z.number().optional(),
      discount: z.number().optional(),
      netSubtotal: z.number().optional(),
      igv: z.number().optional(),
      total: z.number().optional(),
      discountRate: z.number().optional(),
    })
    .optional(),
  snapshot: z.record(z.any()).optional(),
  lines: z
    .array(
      z.object({
        baselineId: z.number().int().positive().optional(),
        description: z.string().min(1),
        unit: z.string().optional(),
        quantity: z.number().optional(),
        unitPrice: z.number().optional(),
        totalPrice: z.number().optional(),
      }),
    )
    .optional(),
});
type PurchaseOrderSavePayload = z.infer<typeof PurchaseOrderSaveSchema>;

router.get('/quotations/processes', async (_req, res) => {
  try {
    const list = await listQuotationProcesses();
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo listar los procesos' });
  }
});

router.post('/quotations/processes/import-base', upload.single('file'), async (req, res) => {
  const parsed = BaseImportSchema.safeParse(req.body);
  if (!parsed.success) {
    await cleanupTemp(req.file?.path);
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Adjunta un archivo Excel o PDF' });
  }
  try {
    const payload = parsed.data as BaseImportPayload;
    const result = await importBaselineProcess({
      name: payload.name,
      code: payload.code,
      baseCurrency: payload.baseCurrency,
      exchangeRate: payload.exchangeRate,
      targetMarginPct: payload.targetMarginPct,
      notes: payload.notes,
      filePath: req.file.path,
      originalName: req.file.originalname,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo importar la base' });
  } finally {
    await cleanupTemp(req.file?.path);
  }
});

router.post('/quotations/processes/:processId/import', upload.single('file'), async (req, res) => {
  const paramsId = Number(req.params.processId);
  if (!paramsId) return res.status(400).json({ error: 'processId inválido' });
  const parsed = SupplierImportSchema.safeParse(req.body);
  if (!parsed.success) {
    await cleanupTemp(req.file?.path);
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Adjunta un archivo de cotización' });
  }
  try {
    const payload = parsed.data as SupplierImportPayload;
    const result = await importSupplierQuote({
      processId: paramsId,
      proveedorId: payload.proveedorId,
      supplierName: payload.supplierName,
      currency: payload.currency,
      exchangeRate: payload.exchangeRate,
      notes: payload.notes,
      filePath: req.file.path,
      originalName: req.file.originalname,
      replaceQuotationId: payload.quotationId,
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo importar la cotización del proveedor' });
  } finally {
    await cleanupTemp(req.file?.path);
  }
});

router.get('/quotations/processes/:processId/summary', async (req, res) => {
  const processId = Number(req.params.processId);
  if (!processId) return res.status(400).json({ error: 'processId inválido' });
  try {
    const summary = await getQuotationProcessSummary(processId);
    res.json(summary);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo obtener el resumen' });
  }
});

router.post('/quotations/processes/:processId/reset', async (req, res) => {
  const processId = Number(req.params.processId);
  if (!processId) return res.status(400).json({ error: 'processId inválido' });
  try {
    await deleteQuotationProcess(processId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo limpiar el proceso' });
  }
});

router.get('/quotations/processes/:processId/purchase-orders', async (req, res) => {
  const processId = Number(req.params.processId);
  if (!processId) return res.status(400).json({ error: 'processId inválido' });
  try {
    const data = await listPurchaseOrderLogs(processId);
    res.json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo listar las órdenes de compra' });
  }
});

router.post('/quotations/processes/:processId/purchase-orders', async (req, res) => {
  const processId = Number(req.params.processId);
  if (!processId) return res.status(400).json({ error: 'processId inválido' });
  const parsed = PurchaseOrderSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }
  try {
    const payload = parsed.data as PurchaseOrderSavePayload;
    const result = await createPurchaseOrderLog({
      processId,
      quotationId: payload.quotationId,
      supplierId: payload.supplierId,
      supplierName: payload.supplierName,
      orderNumber: payload.orderNumber,
      issueDate: payload.issueDate,
      currency: payload.currency,
      totals: payload.totals,
      snapshot: payload.snapshot,
      lines: payload.lines?.map(line => ({
        baselineId: line.baselineId,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
      })),
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo guardar la orden de compra' });
  }
});

router.put('/quotations/processes/:processId/purchase-orders/:orderId', async (req, res) => {
  const processId = Number(req.params.processId);
  const orderId = Number(req.params.orderId);
  if (!processId || !orderId) return res.status(400).json({ error: 'Identificadores inválidos' });
  const parsed = PurchaseOrderSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }
  try {
    const payload = parsed.data as PurchaseOrderSavePayload;
    const order = await updatePurchaseOrderLog(orderId, {
      processId,
      quotationId: payload.quotationId,
      supplierId: payload.supplierId,
      supplierName: payload.supplierName,
      orderNumber: payload.orderNumber,
      issueDate: payload.issueDate,
      currency: payload.currency,
      totals: payload.totals,
      snapshot: payload.snapshot,
      lines: payload.lines?.map(line => ({
        baselineId: line.baselineId,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
      })),
    });
    res.json({ order });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo actualizar la orden' });
  }
});

router.post('/quotations/:quotationId/manual-item', async (req, res) => {
  const quotationId = Number(req.params.quotationId);
  if (!quotationId) return res.status(400).json({ error: 'quotationId inválido' });
  const parsed = ManualQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }
  try {
    const result = await upsertManualQuotationItem({
      quotationId,
      baselineId: parsed.data.baselineId,
      unitPrice: parsed.data.unitPrice,
      quantity: parsed.data.quantity,
      totalPrice: parsed.data.totalPrice,
      currency: parsed.data.currency,
    });
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo actualizar el ítem' });
  }
});

router.delete('/quotations/:quotationId', async (req, res) => {
  const quotationId = Number(req.params.quotationId);
  if (!quotationId) return res.status(400).json({ error: 'quotationId inválido' });
  const force = req.query.force === '1' || req.query.force === 'true';
  try {
    await deleteSupplierQuotation(quotationId, { force });
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo eliminar la cotización' });
  }
});

router.get('/quotations/processes/:processId/purchase-progress', async (req, res) => {
  const processId = Number(req.params.processId);
  if (!processId) return res.status(400).json({ error: 'processId inválido' });
  try {
    const rows = await computePurchaseProgress(processId);
    res.json({ items: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo calcular el avance de compras' });
  }
});

router.get('/quotations/processes/:processId/deliveries', async (req, res) => {
  const processId = Number(req.params.processId);
  if (!processId) return res.status(400).json({ error: 'processId inválido' });
  try {
    const deliveries = await listPurchaseDeliveries(processId);
    res.json({ items: deliveries });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo listar las guías' });
  }
});

const DeliverySchema = z.object({
  orderId: z.number().int().positive().optional(),
  proveedorId: z.number().int().positive().optional(),
  supplierName: z.string().optional(),
  guideNumber: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      baselineId: z.number().int().positive().optional(),
      orderLineId: z.number().int().positive().optional(),
      description: z.string().min(2),
      unit: z.string().optional(),
      quantity: z.number().positive(),
      notes: z.string().optional(),
    }),
  ),
});

router.post('/quotations/processes/:processId/deliveries', async (req, res) => {
  const processId = Number(req.params.processId);
  if (!processId) return res.status(400).json({ error: 'processId inválido' });
  const parsed = DeliverySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validación', issues: parsed.error.issues });
  }
  try {
    const delivery = await createPurchaseDelivery({
      processId,
      ...parsed.data,
      items: parsed.data.items.map(item => ({
        baselineId: item.baselineId,
        orderLineId: item.orderLineId,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        notes: item.notes,
      })),
    });
    res.status(201).json(delivery);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'No se pudo registrar la guía' });
  }
});

export default router;
