PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "documentType" TEXT DEFAULT 'DNI',
    "documentNumber" TEXT,
    "position" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "baseSalary" DECIMAL NOT NULL DEFAULT 0,
    "dailyHours" DECIMAL NOT NULL DEFAULT 8,
    "pensionSystem" TEXT NOT NULL DEFAULT 'NINGUNO',
    "pensionRate" DECIMAL NOT NULL DEFAULT 0,
    "healthRate" DECIMAL NOT NULL DEFAULT 0.09,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "area" TEXT NOT NULL DEFAULT 'OPERATIVE',
    "obraId" INTEGER,
    "notes" TEXT,
    "absenceSundayPenalty" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Employee" (
    "id", "code", "firstName", "lastName", "documentType", "documentNumber", "position", "phone", "email", "startDate", "endDate",
    "baseSalary", "dailyHours", "pensionSystem", "pensionRate", "healthRate", "isActive", "obraId", "notes", "absenceSundayPenalty", "createdAt", "updatedAt"
)
SELECT
    "id", "code", "firstName", "lastName", "documentType", "documentNumber", "position", "phone", "email", "startDate", "endDate",
    "baseSalary", "dailyHours", "pensionSystem", "pensionRate", "healthRate", "isActive", "obraId", "notes", "absenceSundayPenalty", "createdAt", "updatedAt"
FROM "Employee";

DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";

CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");
CREATE UNIQUE INDEX "Employee_documentNumber_key" ON "Employee"("documentNumber");
CREATE INDEX "Employee_obraId_isActive_idx" ON "Employee"("obraId", "isActive");
CREATE INDEX "Employee_lastName_idx" ON "Employee"("lastName");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
