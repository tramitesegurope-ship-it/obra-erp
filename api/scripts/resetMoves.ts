// scripts/resetMoves.ts
// (mantiene el nombre histórico, pero ahora reinicia movimientos, ingresos y egresos)
import { PrismaClient } from '@prisma/client';
import { resetDemoData } from '../src/services/resetDemo';

const prisma = new PrismaClient();

async function main() {
  await resetDemoData(prisma);
  console.log('OK: Movimientos, ingresos y egresos borrados. Contadores reiniciados.');
}

main()
  .catch((e) => {
    console.error('Fallo reseteando la base de prueba:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
