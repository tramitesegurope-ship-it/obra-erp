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
    "holidayCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("createdAt", "date", "employeeId", "extraHours", "holidayWorked", "id", "minutesLate", "notes", "permissionHours", "permissionPaid", "status", "updatedAt") SELECT "createdAt", "date", "employeeId", "extraHours", "holidayWorked", "id", "minutesLate", "notes", "permissionHours", "permissionPaid", "status", "updatedAt" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
UPDATE "AttendanceRecord" SET "holidayCount" = 1 WHERE "holidayWorked" = true;
CREATE INDEX "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
