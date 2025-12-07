-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyCashExpense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "renditionId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "personalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidWithPersonal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyCashExpense_renditionId_fkey" FOREIGN KEY ("renditionId") REFERENCES "DailyCashRendition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyCashExpense" ("amount", "createdAt", "description", "id", "paidWithPersonal", "renditionId") SELECT "amount", "createdAt", "description", "id", "paidWithPersonal", "renditionId" FROM "DailyCashExpense";
DROP TABLE "DailyCashExpense";
ALTER TABLE "new_DailyCashExpense" RENAME TO "DailyCashExpense";
CREATE INDEX "DailyCashExpense_renditionId_idx" ON "DailyCashExpense"("renditionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
