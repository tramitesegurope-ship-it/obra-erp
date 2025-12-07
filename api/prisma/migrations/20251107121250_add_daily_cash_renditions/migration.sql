-- CreateTable
CREATE TABLE "DailyCashRendition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "obraId" INTEGER,
    "received" DECIMAL NOT NULL DEFAULT 0,
    "spent" DECIMAL NOT NULL DEFAULT 0,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyCashRendition_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DailyCashRendition_date_idx" ON "DailyCashRendition"("date");

-- CreateIndex
CREATE INDEX "DailyCashRendition_obraId_date_idx" ON "DailyCashRendition"("obraId", "date");
