-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AttendanceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "minutesLate" INTEGER DEFAULT 0,
    "permissionHours" DECIMAL DEFAULT 0,
    "extraHours" DECIMAL DEFAULT 0,
    "permissionPaid" BOOLEAN DEFAULT false,
    "holidayWorked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("createdAt", "date", "employeeId", "extraHours", "id", "minutesLate", "notes", "permissionHours", "permissionPaid", "status", "updatedAt") SELECT "createdAt", "date", "employeeId", "extraHours", "id", "minutesLate", "notes", "permissionHours", "permissionPaid", "status", "updatedAt" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE INDEX "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");
CREATE TABLE "new_PayrollEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "periodId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "baseSalary" DECIMAL NOT NULL,
    "dailyRate" DECIMAL NOT NULL,
    "hourlyRate" DECIMAL NOT NULL,
    "workedDays" INTEGER NOT NULL DEFAULT 0,
    "absenceDays" INTEGER NOT NULL DEFAULT 0,
    "tardinessMinutes" INTEGER NOT NULL DEFAULT 0,
    "permissionHours" DECIMAL NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "bonusesTotal" DECIMAL NOT NULL DEFAULT 0,
    "deductionsTotal" DECIMAL NOT NULL DEFAULT 0,
    "pensionAmount" DECIMAL NOT NULL DEFAULT 0,
    "healthAmount" DECIMAL NOT NULL DEFAULT 0,
    "grossEarnings" DECIMAL NOT NULL DEFAULT 0,
    "netPay" DECIMAL NOT NULL DEFAULT 0,
    "permissionDays" INTEGER NOT NULL DEFAULT 0,
    "holidayDays" INTEGER NOT NULL DEFAULT 0,
    "holidayBonus" DECIMAL NOT NULL DEFAULT 0,
    "details" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PayrollEntry" ("absenceDays", "baseSalary", "bonusesTotal", "createdAt", "dailyRate", "deductionsTotal", "details", "employeeId", "grossEarnings", "healthAmount", "hourlyRate", "id", "netPay", "overtimeHours", "pensionAmount", "periodId", "permissionHours", "tardinessMinutes", "updatedAt", "workedDays") SELECT "absenceDays", "baseSalary", "bonusesTotal", "createdAt", "dailyRate", "deductionsTotal", "details", "employeeId", "grossEarnings", "healthAmount", "hourlyRate", "id", "netPay", "overtimeHours", "pensionAmount", "periodId", "permissionHours", "tardinessMinutes", "updatedAt", "workedDays" FROM "PayrollEntry";
DROP TABLE "PayrollEntry";
ALTER TABLE "new_PayrollEntry" RENAME TO "PayrollEntry";
CREATE UNIQUE INDEX "PayrollEntry_periodId_employeeId_key" ON "PayrollEntry"("periodId", "employeeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
