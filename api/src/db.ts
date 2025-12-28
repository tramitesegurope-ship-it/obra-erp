// src/db.ts
import { PrismaClient } from '@prisma/client';

// Un único cliente para toda la app
const prisma = new PrismaClient({ log: ['warn', 'error'] });

const SQLITE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_proveedor_name ON Proveedor(name)',
  'CREATE INDEX IF NOT EXISTS idx_material_name ON Material(name)',
  'CREATE INDEX IF NOT EXISTS idx_quotation_supplier_name ON Quotation(supplierName)',
  'CREATE INDEX IF NOT EXISTS idx_purchase_order_supplier_name ON PurchaseOrderLog(supplierName)',
  'CREATE INDEX IF NOT EXISTS idx_employee_document_number ON Employee(documentNumber)',
  'CREATE INDEX IF NOT EXISTS idx_employee_phone ON Employee(phone)',
];

export const ensureSqliteIndexes = async () => {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:')) return;
  for (const statement of SQLITE_INDEXES) {
    await prisma.$executeRawUnsafe(statement);
  }
};

export default prisma;
