-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Move" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "obraId" INTEGER NOT NULL,
    "frenteId" INTEGER,
    "materialId" INTEGER NOT NULL,
    "proveedorId" INTEGER,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitCost" REAL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Move_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Move_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Move_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Move_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Move" ("date", "frenteId", "id", "materialId", "note", "obraId", "proveedorId", "quantity", "type", "unitCost") SELECT "date", "frenteId", "id", "materialId", "note", "obraId", "proveedorId", "quantity", "type", "unitCost" FROM "Move";
DROP TABLE "Move";
ALTER TABLE "new_Move" RENAME TO "Move";
CREATE INDEX "Move_obraId_materialId_idx" ON "Move"("obraId", "materialId");
CREATE INDEX "Move_materialId_date_idx" ON "Move"("materialId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
