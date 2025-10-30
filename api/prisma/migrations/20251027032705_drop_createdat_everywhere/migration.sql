/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Material` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Move` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Obra` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Proveedor` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT
);
INSERT INTO "new_Material" ("code", "id", "name", "unit") SELECT "code", "id", "name", "unit" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");
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
CREATE TABLE "new_Obra" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT
);
INSERT INTO "new_Obra" ("id", "name") SELECT "id", "name" FROM "Obra";
DROP TABLE "Obra";
ALTER TABLE "new_Obra" RENAME TO "Obra";
CREATE UNIQUE INDEX "Obra_name_key" ON "Obra"("name");
CREATE UNIQUE INDEX "Obra_code_key" ON "Obra"("code");
CREATE TABLE "new_Proveedor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ruc" TEXT,
    "phone" TEXT
);
INSERT INTO "new_Proveedor" ("id", "name", "phone", "ruc") SELECT "id", "name", "phone", "ruc" FROM "Proveedor";
DROP TABLE "Proveedor";
ALTER TABLE "new_Proveedor" RENAME TO "Proveedor";
CREATE UNIQUE INDEX "Proveedor_ruc_key" ON "Proveedor"("ruc");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
