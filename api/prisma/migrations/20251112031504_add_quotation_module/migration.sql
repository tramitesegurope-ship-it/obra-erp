-- CreateTable
CREATE TABLE "QuotationProcess" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "baseCurrency" TEXT NOT NULL DEFAULT 'PEN',
    "targetCurrency" TEXT,
    "exchangeRate" DECIMAL,
    "targetMarginPct" DECIMAL,
    "baselineFileId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuotationProcess_baselineFileId_fkey" FOREIGN KEY ("baselineFileId") REFERENCES "QuotationAttachment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationBaselineItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "processId" INTEGER NOT NULL,
    "materialId" INTEGER,
    "sheetName" TEXT,
    "sectionPath" TEXT,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL DEFAULT 0,
    "unitPrice" DECIMAL DEFAULT 0,
    "totalPrice" DECIMAL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuotationBaselineItem_processId_fkey" FOREIGN KEY ("processId") REFERENCES "QuotationProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationBaselineItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "processId" INTEGER NOT NULL,
    "proveedorId" INTEGER,
    "supplierName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" DECIMAL,
    "submittedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL DEFAULT 0,
    "totalAmountPen" DECIMAL DEFAULT 0,
    "qualityScore" INTEGER,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_processId_fkey" FOREIGN KEY ("processId") REFERENCES "QuotationProcess" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quotation_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotationId" INTEGER NOT NULL,
    "baselineItemId" INTEGER,
    "materialId" INTEGER,
    "sourceRow" INTEGER,
    "itemCode" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL DEFAULT 0,
    "unitPrice" DECIMAL DEFAULT 0,
    "totalPrice" DECIMAL DEFAULT 0,
    "currency" TEXT DEFAULT 'PEN',
    "normalizedPrice" DECIMAL,
    "matchScore" REAL DEFAULT 0,
    "extraAttributes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationItem_baselineItemId_fkey" FOREIGN KEY ("baselineItemId") REFERENCES "QuotationBaselineItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QuotationItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationAttachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quotationId" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'SUPPLIER_FILE',
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "parsed" BOOLEAN NOT NULL DEFAULT false,
    "parsedAt" DATETIME,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuotationAttachment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QuotationProcess_code_key" ON "QuotationProcess"("code");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationProcess_baselineFileId_key" ON "QuotationProcess"("baselineFileId");

-- CreateIndex
CREATE INDEX "QuotationBaselineItem_processId_itemCode_idx" ON "QuotationBaselineItem"("processId", "itemCode");

-- CreateIndex
CREATE INDEX "QuotationBaselineItem_materialId_idx" ON "QuotationBaselineItem"("materialId");

-- CreateIndex
CREATE INDEX "Quotation_processId_status_idx" ON "Quotation"("processId", "status");

-- CreateIndex
CREATE INDEX "Quotation_proveedorId_idx" ON "Quotation"("proveedorId");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationItem_baselineItemId_idx" ON "QuotationItem"("baselineItemId");

-- CreateIndex
CREATE INDEX "QuotationItem_materialId_idx" ON "QuotationItem"("materialId");

-- CreateIndex
CREATE INDEX "QuotationAttachment_quotationId_idx" ON "QuotationAttachment"("quotationId");
