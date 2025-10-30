// scripts/resetMoves.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1) borramos todos los movimientos
  await prisma.move.deleteMany({});

  // 2) reset autoincrement solo para SQLite
  //    (si usas Postgres/MariaDB avísame y te doy los comandos equivalentes)
  await prisma.$executeRawUnsafe(
    "DELETE FROM sqlite_sequence WHERE name = 'Move';"
  );

  console.log('OK: Movimientos borrados y contador reseteado.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });