import type { PrismaClient } from '@prisma/client';
import { AssetStatus } from '@prisma/client';

const SQLITE_RESET_SEQUENCES = `
DELETE FROM sqlite_sequence WHERE name IN (
  'Move',
  'Expense',
  'Income',
  'PayrollAdjustment',
  'PayrollEntry',
  'PayrollPeriod',
  'AttendanceRecord',
  'Employee'
);
`;

export async function resetDemoData(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    // El orden importa por las claves foráneas.
    await tx.payrollAdjustment.deleteMany({});
    await tx.payrollEntry.deleteMany({});
    await tx.payrollPeriod.deleteMany({});
    await tx.attendanceRecord.deleteMany({});
    await tx.employee.deleteMany({});
    await tx.expense.deleteMany({});
    await tx.move.deleteMany({});
    await tx.income.deleteMany({});

    await tx.material.updateMany({
      data: {
        assetStatus: AssetStatus.IN_WAREHOUSE,
        assetResponsible: null,
      },
    });

    // Reiniciar autoincrementos en SQLite (opcional en otras BD).
    if (tx.$executeRawUnsafe) {
      await tx.$executeRawUnsafe(SQLITE_RESET_SEQUENCES);
    }
  });
}
