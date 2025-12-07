-- CreateTable
CREATE TABLE "MaterialGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MaterialGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "groupId" INTEGER,
    "minStock" DECIMAL NOT NULL DEFAULT 0,
    "reorderQuantity" DECIMAL NOT NULL DEFAULT 0,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "isCompanyAsset" BOOLEAN NOT NULL DEFAULT false,
    "assetStatus" TEXT NOT NULL DEFAULT 'IN_WAREHOUSE',
    "assetResponsible" TEXT,
    CONSTRAINT "Material_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MaterialGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Material" ("assetResponsible", "assetStatus", "code", "id", "isCompanyAsset", "name", "unit") SELECT "assetResponsible", "assetStatus", "code", "id", "isCompanyAsset", "name", "unit" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");
CREATE INDEX "Material_groupId_idx" ON "Material"("groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MaterialGroup_name_key" ON "MaterialGroup"("name");
