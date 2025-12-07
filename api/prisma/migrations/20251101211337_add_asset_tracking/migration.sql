-- AlterTable
ALTER TABLE "Move" ADD COLUMN "assetStatus" TEXT;
ALTER TABLE "Move" ADD COLUMN "responsible" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "isCompanyAsset" BOOLEAN NOT NULL DEFAULT false,
    "assetStatus" TEXT NOT NULL DEFAULT 'IN_WAREHOUSE',
    "assetResponsible" TEXT
);
INSERT INTO "new_Material" ("code", "id", "name", "unit") SELECT "code", "id", "name", "unit" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
