-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "obraId" INTEGER NOT NULL,
    "frenteId" INTEGER,
    "proveedorId" INTEGER,
    "materialId" INTEGER,
    "categoryId" INTEGER,
    "docType" TEXT NOT NULL DEFAULT 'FACTURA',
    "docSerie" TEXT,
    "docNumero" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'DIRECTO',
    "variableType" TEXT NOT NULL DEFAULT 'FIJO',
    "quantity" DECIMAL,
    "unitCost" DECIMAL,
    "igvRate" DECIMAL NOT NULL DEFAULT 0.18,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "base" DECIMAL NOT NULL,
    "igv" DECIMAL NOT NULL,
    "total" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    "paidAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'REGISTRADO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("base", "categoryId", "createdAt", "date", "description", "frenteId", "id", "igv", "igvRate", "isTaxable", "materialId", "obraId", "paidAt", "paymentMethod", "proveedorId", "quantity", "status", "total", "type", "unitCost", "updatedAt", "variableType") SELECT "base", "categoryId", "createdAt", "date", "description", "frenteId", "id", "igv", "igvRate", "isTaxable", "materialId", "obraId", "paidAt", "paymentMethod", "proveedorId", "quantity", "status", "total", "type", "unitCost", "updatedAt", "variableType" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
