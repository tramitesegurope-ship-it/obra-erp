-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyCashRendition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "obraId" INTEGER,
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "received" DECIMAL NOT NULL DEFAULT 0,
    "spent" DECIMAL NOT NULL DEFAULT 0,
    "personalContribution" DECIMAL NOT NULL DEFAULT 0,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyCashRendition_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DailyCashRendition" ("balance", "createdAt", "date", "id", "notes", "obraId", "personalContribution", "received", "spent", "updatedAt") SELECT "balance", "createdAt", "date", "id", "notes", "obraId", "personalContribution", "received", "spent", "updatedAt" FROM "DailyCashRendition";
DROP TABLE "DailyCashRendition";
ALTER TABLE "new_DailyCashRendition" RENAME TO "DailyCashRendition";
CREATE INDEX "DailyCashRendition_date_idx" ON "DailyCashRendition"("date");
CREATE INDEX "DailyCashRendition_obraId_date_idx" ON "DailyCashRendition"("obraId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
